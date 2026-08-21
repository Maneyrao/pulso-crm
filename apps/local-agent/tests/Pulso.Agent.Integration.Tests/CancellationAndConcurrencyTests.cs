using Pulso.Agent.Protocol;
using Pulso.Agent.Protocol.Payloads;
using Xunit;

namespace Pulso.Agent.Integration.Tests;

public sealed class CancellationAndConcurrencyTests : AgentIntegrationTestBase
{
    [Fact]
    public async Task Operation_cancel_on_a_continuous_identify_returns_operation_cancelled()
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

        // Al menos una identificación en curso antes de cancelar, para probar que corta a mitad de camino.
        await Client.ReceiveUntilAsync(MessageTypes.IdentifySent, TimeSpan.FromSeconds(10));

        await Client.SendAsync(MessageTypes.OperationCancel, new OperationCancelPayload { OpId = opId, Reason = "USER_CANCELLED" });

        var cancelled = await Client.ReceiveUntilAsync(MessageTypes.OperationCancelled, TimeSpan.FromSeconds(10));
        var payload = Assert.IsType<OperationCancelledPayload>(cancelled.TypedPayload);
        Assert.Equal(opId, payload.OpId);
        Assert.Equal("USER_CANCELLED", payload.Reason);
    }

    [Fact]
    public async Task A_second_operation_while_one_is_in_flight_gets_AGENT_BUSY()
    {
        var firstOpId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.IdentifyStart, new IdentifyStartPayload
        {
            OpId = firstOpId,
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            BranchId = "branch-1",
            Continuous = true,
        });

        await Client.ReceiveUntilAsync(MessageTypes.IdentifyCaptured, TimeSpan.FromSeconds(10));

        var secondOpId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.EnrollStart, new EnrollStartPayload
        {
            OpId = secondOpId,
            EnrollmentId = "enr-blocked",
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            SamplesRequired = 1,
            MinQuality = 10,
        });

        var error = await Client.ReceiveUntilAsync(MessageTypes.Error, TimeSpan.FromSeconds(10));
        var payload = Assert.IsType<ErrorPayload>(error.TypedPayload);
        Assert.Equal("AGENT_BUSY", payload.Code);

        // limpieza: cortamos la operación que quedó corriendo para no filtrar estado entre tests.
        await Client.SendAsync(MessageTypes.OperationCancel, new OperationCancelPayload { OpId = firstOpId });
        await Client.ReceiveUntilAsync(MessageTypes.OperationCancelled, TimeSpan.FromSeconds(10));
    }

    [Fact]
    public async Task Cancel_frees_the_session_so_a_new_enroll_can_start_right_after()
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
        await Client.ReceiveUntilAsync(MessageTypes.IdentifyCaptured, TimeSpan.FromSeconds(10));

        await Client.SendAsync(MessageTypes.OperationCancel, new OperationCancelPayload { OpId = opId });
        await Client.ReceiveUntilAsync(MessageTypes.OperationCancelled, TimeSpan.FromSeconds(10));

        var newOpId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.EnrollStart, new EnrollStartPayload
        {
            OpId = newOpId,
            EnrollmentId = "enr-after-cancel",
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            SamplesRequired = 1,
            MinQuality = 10,
        });

        var completed = await Client.ReceiveUntilAsync(MessageTypes.EnrollCompleted, TimeSpan.FromSeconds(10));
        Assert.Equal(newOpId, ((EnrollCompletedPayload)completed.TypedPayload!).OpId);
    }
}
