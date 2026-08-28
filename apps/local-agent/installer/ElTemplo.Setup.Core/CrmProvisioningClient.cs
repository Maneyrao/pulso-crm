using System.Net.Http.Json;
using System.Text.Json;

namespace ElTemplo.Setup.Core;

public sealed class CrmProvisioningClient : ICrmAuthenticator, ICrmProvisioner, IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http;
    private readonly Dictionary<string, string> _cookies = new(StringComparer.OrdinalIgnoreCase);

    public CrmProvisioningClient(Uri baseUri, HttpMessageHandler? handler = null)
    {
        _http = handler is null ? new HttpClient() : new HttpClient(handler, disposeHandler: true);
        _http.BaseAddress = baseUri;
        _http.Timeout = TimeSpan.FromSeconds(25);
    }

    public async Task<CrmSession> LoginAsync(
        string email,
        string password,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "auth/login")
        {
            Content = JsonContent.Create(new { email = email.Trim(), password }),
        };
        using var response = await _http.SendAsync(request, cancellationToken);
        CaptureCookies(response);
        await EnsureSuccessAsync(response, cancellationToken);

        var body = await response.Content.ReadFromJsonAsync<LoginResponse>(JsonOptions, cancellationToken)
            ?? throw new CrmProvisioningException("INVALID_LOGIN_RESPONSE", "El CRM respondió de una forma inesperada.");
        if (!body.Permissions.Contains("device:manage", StringComparer.Ordinal))
        {
            throw new CrmProvisioningException(
                "DEVICE_PERMISSION_REQUIRED",
                "Esta cuenta no tiene permiso para configurar el lector.");
        }

        return new CrmSession(
            body.User.Email,
            body.Gym.Name,
            body.Branches.Select(branch => new CrmBranch(branch.Id, branch.Name)).ToArray(),
            body.DefaultBranchId);
    }

    public async Task<ProvisionedAgent> CreateAgentAsync(
        string branchId,
        string name,
        CancellationToken cancellationToken)
    {
        using var response = await SendAuthenticatedAsync(
            HttpMethod.Post,
            "agents",
            new { branchId, name },
            cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        var body = await response.Content.ReadFromJsonAsync<CreateAgentResponse>(JsonOptions, cancellationToken)
            ?? throw new CrmProvisioningException("INVALID_AGENT_RESPONSE", "El CRM no pudo completar la vinculación.");
        return new ProvisionedAgent(body.Agent.Id, body.Agent.InstallationId, body.PairingSecret);
    }

    public async Task ApproveAgentAsync(string agentId, CancellationToken cancellationToken)
    {
        using var response = await SendAuthenticatedAsync(
            HttpMethod.Post,
            $"agents/{Uri.EscapeDataString(agentId)}/approve",
            body: null,
            cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
    }

    public void Dispose() => _http.Dispose();

    private async Task<HttpResponseMessage> SendAuthenticatedAsync(
        HttpMethod method,
        string path,
        object? body,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null) request.Content = JsonContent.Create(body);

        if (_cookies.Count > 0)
        {
            request.Headers.TryAddWithoutValidation(
                "Cookie",
                string.Join("; ", _cookies.Select(cookie => $"{cookie.Key}={cookie.Value}")));
        }
        if (_cookies.TryGetValue("pulso_csrf", out var csrf))
        {
            request.Headers.TryAddWithoutValidation("X-CSRF-Token", csrf);
        }

        var response = await _http.SendAsync(request, cancellationToken);
        CaptureCookies(response);
        return response;
    }

    private void CaptureCookies(HttpResponseMessage response)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var headers)) return;
        foreach (var header in headers)
        {
            var cookie = header.Split(';', 2)[0];
            var separator = cookie.IndexOf('=');
            if (separator <= 0) continue;
            var name = cookie[..separator].Trim();
            var value = cookie[(separator + 1)..].Trim();
            if (value.Length == 0) _cookies.Remove(name);
            else _cookies[name] = value;
        }
    }

    private static async Task EnsureSuccessAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode) return;

        ApiProblem? problem = null;
        try
        {
            problem = await response.Content.ReadFromJsonAsync<ApiProblem>(JsonOptions, cancellationToken);
        }
        catch (JsonException)
        {
            // A non-JSON proxy response still becomes a safe user-facing error.
        }

        var code = string.IsNullOrWhiteSpace(problem?.Code)
            ? $"CRM_HTTP_{(int)response.StatusCode}"
            : problem.Code;
        var message = code switch
        {
            "INVALID_CREDENTIALS" => "Email o contraseña incorrectos.",
            "DEVICE_PERMISSION_REQUIRED" => "Esta cuenta no tiene permiso para configurar el lector.",
            _ => "No pudimos completar la configuración en el CRM. Reintentá en unos minutos.",
        };
        throw new CrmProvisioningException(code, message);
    }

    private sealed record LoginResponse(
        LoginUser User,
        LoginGym Gym,
        IReadOnlyList<LoginBranch> Branches,
        string? DefaultBranchId,
        IReadOnlyList<string> Permissions);

    private sealed record LoginUser(string Email);

    private sealed record LoginGym(string Name);

    private sealed record LoginBranch(string Id, string Name);

    private sealed record CreateAgentResponse(CreatedAgent Agent, string PairingSecret);

    private sealed record CreatedAgent(string Id, string InstallationId);

    private sealed record ApiProblem(string? Code);
}
