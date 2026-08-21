using Pulso.Agent.Protocol;
using Pulso.Agent.Protocol.Payloads;
using Xunit;

namespace Pulso.Agent.Integration.Tests;

/// <summary>
/// WEBSOCKET_PROTOCOL.md §2: sobre ws sin TLS sólo se permiten hello/status.get/ping; el resto
/// responde TLS_REQUIRED sin cerrar la conexión. AgentIntegrationTestBase ya deja el agente
/// pareado y READY, así que esto aísla puramente el gating de TLS (no de estado del agente).
/// </summary>
public sealed class TlsGatingTests : AgentIntegrationTestBase
{
    protected override bool TlsEnabled => false;

    [Fact]
    public async Task Enroll_start_over_plain_ws_is_rejected_with_TLS_REQUIRED()
    {
        var opId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.EnrollStart, new EnrollStartPayload
        {
            OpId = opId,
            EnrollmentId = "enr-1",
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            SamplesRequired = 1,
            MinQuality = 10,
        });

        var error = await Client.ReceiveUntilAsync(MessageTypes.Error, TimeSpan.FromSeconds(5));
        var payload = Assert.IsType<ErrorPayload>(error.TypedPayload);
        Assert.Equal("TLS_REQUIRED", payload.Code);
        Assert.Equal(opId, payload.OpId);
    }

    [Fact]
    public async Task Identify_start_over_plain_ws_is_rejected_with_TLS_REQUIRED()
    {
        var opId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.IdentifyStart, new IdentifyStartPayload
        {
            OpId = opId,
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            BranchId = "branch-1",
        });

        var error = await Client.ReceiveUntilAsync(MessageTypes.Error, TimeSpan.FromSeconds(5));
        Assert.Equal("TLS_REQUIRED", ((ErrorPayload)error.TypedPayload!).Code);
    }

    [Fact]
    public async Task Status_get_and_ping_still_work_without_TLS()
    {
        await Client.SendAsync(MessageTypes.StatusGet, (object?)null);
        var status = await Client.ReceiveUntilAsync(MessageTypes.Status, TimeSpan.FromSeconds(5));
        Assert.False(((StatusPayload)status.TypedPayload!).Tls);

        await Client.SendAsync(MessageTypes.Ping, (object?)null);
        await Client.ReceiveUntilAsync(MessageTypes.Pong, TimeSpan.FromSeconds(5));
    }
}
