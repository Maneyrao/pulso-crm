using Pulso.Agent.Protocol;
using Pulso.Agent.Protocol.Payloads;
using Xunit;

namespace Pulso.Agent.Integration.Tests;

public sealed class IdentifyFlowTests : AgentIntegrationTestBase
{
    [Fact]
    public async Task Single_shot_identify_captures_and_sends_without_leaking_a_result_to_the_agent()
    {
        var opId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.IdentifyStart, new IdentifyStartPayload
        {
            OpId = opId,
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            BranchId = "branch-1",
            Continuous = false,
        });

        var captured = await Client.ReceiveUntilAsync(MessageTypes.IdentifyCaptured, TimeSpan.FromSeconds(10));
        Assert.Equal(opId, ((IdentifyCapturedPayload)captured.TypedPayload!).OpId);

        var sent = await Client.ReceiveUntilAsync(MessageTypes.IdentifySent, TimeSpan.FromSeconds(10));
        // identify.sent sólo trae opId: no hay forma de que el agente reciba identidad (§5.3, §7 de BIOMETRIC_SECURITY.md).
        Assert.Equal(opId, ((IdentifySentPayload)sent.TypedPayload!).OpId);

        Assert.Single(Backend.IdentifyRequestBodies);
        var body = Backend.IdentifyRequestBodies.Single();
        Assert.Contains("\"branchId\":\"branch-1\"", body);
        Assert.Contains("\"deviceId\":\"FAKE-0001\"", body);
    }

    [Fact]
    public async Task Continuous_identify_can_be_stopped_with_identify_stop()
    {
        var opId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.IdentifyStart, new IdentifyStartPayload
        {
            OpId = opId,
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            BranchId = "branch-1",
            Continuous = true,
        });

        // Al menos dos identificaciones antes de cortar, para probar que sigue escuchando (§5.3).
        await Client.ReceiveUntilAsync(MessageTypes.IdentifySent, TimeSpan.FromSeconds(10));
        await Client.ReceiveUntilAsync(MessageTypes.IdentifySent, TimeSpan.FromSeconds(10));

        await Client.SendAsync(MessageTypes.IdentifyStop, new IdentifyStopPayload { OpId = opId });

        // Después de identify.stop, un nuevo enroll/identify debe poder arrancar (sesión liberada).
        var secondOpId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.IdentifyStart, new IdentifyStartPayload
        {
            OpId = secondOpId,
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            BranchId = "branch-1",
            Continuous = false,
        });

        var sent = await Client.ReceiveUntilAsync(MessageTypes.IdentifySent, TimeSpan.FromSeconds(10));
        Assert.Equal(secondOpId, ((IdentifySentPayload)sent.TypedPayload!).OpId);
    }

    [Fact]
    public async Task Backend_unreachable_is_reported_as_BACKEND_UNREACHABLE()
    {
        await Backend.DisposeAsync(); // simula backend caído

        var opId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.IdentifyStart, new IdentifyStartPayload
        {
            OpId = opId,
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            BranchId = "branch-1",
            Continuous = false,
        });

        var failed = await Client.ReceiveUntilAsync(MessageTypes.IdentifyFailed, TimeSpan.FromSeconds(10));
        Assert.Equal("BACKEND_UNREACHABLE", ((IdentifyFailedPayload)failed.TypedPayload!).Code);
    }
}
