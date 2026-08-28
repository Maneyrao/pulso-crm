using System.Net;
using System.Text;
using System.Text.Json;
using ElTemplo.Setup.Core;
using Xunit;

namespace ElTemplo.Setup.Core.Tests;

public sealed class CrmProvisioningClientTests
{
    private static readonly Uri BaseUri = new("https://crm.example.test/api/v1/");

    [Fact]
    public async Task Login_ParsesHumanReadableBranchesAndActiveBranch()
    {
        var handler = new QueueHandler(Response(
            HttpStatusCode.OK,
            """
            {
              "user":{"email":"admin@example.test"},
              "gym":{"name":"El Templo"},
              "branches":[
                {"id":"branch-1","name":"Sede Principal"},
                {"id":"branch-2","name":"Anexo"}
              ],
              "defaultBranchId":"branch-1",
              "permissions":["device:manage"]
            }
            """,
            ("Set-Cookie", "pulso_access=access-token; Path=/; HttpOnly"),
            ("Set-Cookie", "pulso_csrf=csrf-token; Path=/")));
        using var client = new CrmProvisioningClient(BaseUri, handler);

        var session = await client.LoginAsync("admin@example.test", "Simal123", CancellationToken.None);

        Assert.Equal("admin@example.test", session.Email);
        Assert.Equal("El Templo", session.GymName);
        Assert.Equal("branch-1", session.ActiveBranchId);
        Assert.Equal(new[] { "Sede Principal", "Anexo" }, session.Branches.Select(branch => branch.Name));
    }

    [Fact]
    public async Task CreateAndApprove_SendSessionCookiesAndCsrfHeader()
    {
        var handler = new QueueHandler(
            Response(
                HttpStatusCode.OK,
                """{"user":{"email":"admin@example.test"},"gym":{"name":"El Templo"},"branches":[{"id":"branch-1","name":"Sede Principal"}],"defaultBranchId":"branch-1","permissions":["device:manage"]}""",
                ("Set-Cookie", "pulso_access=access-token; Path=/; HttpOnly"),
                ("Set-Cookie", "pulso_csrf=csrf-token; Path=/")),
            Response(
                HttpStatusCode.Created,
                """{"agent":{"id":"agent-1","installationId":"installation-1"},"pairingSecret":"pps_once"}"""),
            Response(HttpStatusCode.OK, """{"id":"agent-1","status":"ACTIVE"}"""));
        using var client = new CrmProvisioningClient(BaseUri, handler);
        await client.LoginAsync("admin@example.test", "Simal123", CancellationToken.None);

        var provisioned = await client.CreateAgentAsync("branch-1", "Recepción Windows", CancellationToken.None);
        await client.ApproveAgentAsync(provisioned.AgentId, CancellationToken.None);

        Assert.Equal("installation-1", provisioned.InstallationId);
        Assert.Equal("pps_once", provisioned.PairingSecret);
        Assert.Equal(3, handler.Requests.Count);
        foreach (var request in handler.Requests.Skip(1))
        {
            Assert.Equal("csrf-token", request.Headers["X-CSRF-Token"]);
            Assert.Contains("pulso_access=access-token", request.Headers["Cookie"], StringComparison.Ordinal);
            Assert.Contains("pulso_csrf=csrf-token", request.Headers["Cookie"], StringComparison.Ordinal);
        }

        var createBody = JsonDocument.Parse(handler.Requests[1].Body!);
        Assert.Equal("branch-1", createBody.RootElement.GetProperty("branchId").GetString());
        Assert.Equal("Recepción Windows", createBody.RootElement.GetProperty("name").GetString());
    }

    [Fact]
    public async Task LoginFailure_UsesSafeMessageWithoutEchoingPassword()
    {
        var handler = new QueueHandler(Response(
            HttpStatusCode.Unauthorized,
            """{"code":"INVALID_CREDENTIALS","detail":"Email o contraseña incorrectos."}"""));
        using var client = new CrmProvisioningClient(BaseUri, handler);

        var error = await Assert.ThrowsAsync<CrmProvisioningException>(() =>
            client.LoginAsync("admin@example.test", "password-that-must-not-leak", CancellationToken.None));

        Assert.Equal("INVALID_CREDENTIALS", error.Code);
        Assert.Equal("Email o contraseña incorrectos.", error.Message);
        Assert.DoesNotContain("password-that-must-not-leak", error.ToString(), StringComparison.Ordinal);
        Assert.Null(error.InnerException);
    }

    private static HttpResponseMessage Response(
        HttpStatusCode status,
        string json,
        params (string Name, string Value)[] headers)
    {
        var response = new HttpResponseMessage(status)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        };
        foreach (var (name, value) in headers)
        {
            response.Headers.TryAddWithoutValidation(name, value);
        }
        return response;
    }

    private sealed class QueueHandler(params HttpResponseMessage[] responses) : HttpMessageHandler
    {
        private readonly Queue<HttpResponseMessage> _responses = new(responses);

        public List<CapturedRequest> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Requests.Add(new CapturedRequest(
                request.Method,
                request.RequestUri!,
                request.Headers.ToDictionary(
                    header => header.Key,
                    header => string.Join(",", header.Value),
                    StringComparer.OrdinalIgnoreCase),
                request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken)));
            return _responses.Dequeue();
        }
    }

    private sealed record CapturedRequest(
        HttpMethod Method,
        Uri Uri,
        IReadOnlyDictionary<string, string> Headers,
        string? Body);
}
