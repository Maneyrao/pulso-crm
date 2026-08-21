using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Pulso.Agent.Backend.Http;
using Pulso.Agent.Core.Ports;
using Pulso.Agent.Sensors;

namespace Pulso.Agent.Backend;

/// <summary>
/// Único punto que habla HTTPS con el backend (LOCAL_AGENT_ARCHITECTURE.md §4, componente
/// BackendClient). Implementa <see cref="IBiometricBackendClient"/> para que Core lo consuma sin
/// conocer HTTP, y expone además pair/heartbeat/events para Host/HeartbeatService/AuditBuffer.
/// El reintento con backoff vive en la política de Polly configurada en el HttpClient inyectado
/// (ver ServiceCollectionExtensions), no acá.
/// </summary>
public sealed class BackendClient(HttpClient httpClient) : IBiometricBackendClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public async Task<PairResponse> PairAsync(PairRequest request, CancellationToken ct = default)
    {
        using var response = await SendAsync(HttpMethod.Post, "/api/v1/agent/pair", request, deviceToken: null, ct)
            .ConfigureAwait(false);
        await EnsureSuccessOrThrowAsync(response, ct).ConfigureAwait(false);
        return await ReadAsync<PairResponse>(response, ct).ConfigureAwait(false);
    }

    public async Task<HeartbeatResponse> HeartbeatAsync(string agentCredential, HeartbeatRequest request, CancellationToken ct = default)
    {
        using var response = await SendAsync(HttpMethod.Post, "/api/v1/agent/heartbeat", request, agentCredential, ct)
            .ConfigureAwait(false);
        await EnsureSuccessOrThrowAsync(response, ct).ConfigureAwait(false);
        return await ReadAsync<HeartbeatResponse>(response, ct).ConfigureAwait(false);
    }

    public async Task SendEventsAsync(string agentCredential, IReadOnlyList<AgentAuditEventDto> events, CancellationToken ct = default)
    {
        var body = new SendEventsRequest { Events = events };
        using var response = await SendAsync(HttpMethod.Post, "/api/v1/agent/events", body, agentCredential, ct)
            .ConfigureAwait(false);
        await EnsureSuccessOrThrowAsync(response, ct).ConfigureAwait(false);
    }

    public async Task<EnrollCompleteResult> CompleteEnrollAsync(string deviceToken, EnrollCompleteRequest request, CancellationToken ct)
    {
        var body = new EnrollCompleteHttpRequest
        {
            EnrollmentId = request.EnrollmentId,
            Template = Convert.ToBase64String(request.Template),
            TemplateFormat = MapFormat(request.Format),
            Quality = request.Quality,
        };

        using var response = await SendAsync(HttpMethod.Post, "/api/v1/agent/biometrics/enroll-complete", body, deviceToken, ct)
            .ConfigureAwait(false);
        await EnsureSuccessOrThrowAsync(response, ct).ConfigureAwait(false);

        var parsed = await ReadAsync<EnrollCompleteHttpResponse>(response, ct).ConfigureAwait(false);
        return new EnrollCompleteResult { Ok = parsed.Ok };
    }

    public async Task<IdentifyResult> SubmitIdentifyAsync(string deviceToken, IdentifyRequest request, CancellationToken ct)
    {
        var body = new IdentifyHttpRequest
        {
            BranchId = request.BranchId,
            DeviceId = request.DeviceId,
            Template = Convert.ToBase64String(request.Template),
            TemplateFormat = MapFormat(request.Format),
            Quality = request.Quality,
            CapturedAt = request.CapturedAt,
        };

        using var response = await SendAsync(HttpMethod.Post, "/api/v1/agent/biometrics/identify", body, deviceToken, ct)
            .ConfigureAwait(false);
        await EnsureSuccessOrThrowAsync(response, ct).ConfigureAwait(false);

        var parsed = await ReadAsync<IdentifyHttpResponse>(response, ct).ConfigureAwait(false);
        return new IdentifyResult { Resolved = parsed.Resolved };
    }

    private async Task<HttpResponseMessage> SendAsync<TBody>(
        HttpMethod method, string path, TBody body, string? deviceToken, CancellationToken ct)
    {
        using var httpRequest = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(body, options: JsonOptions),
        };

        if (deviceToken is not null)
        {
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", deviceToken);
        }

        try
        {
            return await httpClient.SendAsync(httpRequest, ct).ConfigureAwait(false);
        }
        catch (HttpRequestException ex)
        {
            throw new BackendUnreachableException($"No se pudo alcanzar al backend: {ex.Message}");
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            // Timeout del HttpClient (no cancelación explícita del caller).
            throw new BackendUnreachableException($"Timeout hablando con el backend: {ex.Message}");
        }
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, CancellationToken ct)
    {
        var parsed = await response.Content.ReadFromJsonAsync<T>(JsonOptions, ct).ConfigureAwait(false);
        return parsed ?? throw new BackendUnreachableException("El backend devolvió un cuerpo vacío o inválido.");
    }

    private static async Task EnsureSuccessOrThrowAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        if (response.StatusCode is HttpStatusCode.ServiceUnavailable or HttpStatusCode.GatewayTimeout
            or HttpStatusCode.BadGateway or HttpStatusCode.RequestTimeout)
        {
            throw new BackendUnreachableException($"Backend devolvió {(int)response.StatusCode}.");
        }

        var code = response.StatusCode switch
        {
            HttpStatusCode.Unauthorized => "INVALID_DEVICE_TOKEN",
            HttpStatusCode.Forbidden => "AGENT_REVOKED",
            HttpStatusCode.UnprocessableEntity => "TEMPLATE_QUALITY_TOO_LOW",
            (HttpStatusCode)429 => "RATE_LIMITED",
            _ => "BACKEND_REJECTED",
        };

        string detail;
        try
        {
            detail = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        }
        catch
        {
            detail = $"HTTP {(int)response.StatusCode}";
        }

        throw new BackendRejectedException(code, detail);
    }

    private static string MapFormat(TemplateFormat format) => format switch
    {
        TemplateFormat.Iso19794_2 => "ISO_19794_2",
        TemplateFormat.Ansi378 => "ANSI_378",
        TemplateFormat.VendorProprietary => "VENDOR_PROPRIETARY",
        _ => throw new ArgumentOutOfRangeException(nameof(format), format, null),
    };
}
