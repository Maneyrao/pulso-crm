using Pulso.Agent.Protocol;
using Pulso.Agent.Protocol.Payloads;
using Xunit;

namespace Pulso.Agent.Integration.Tests;

/// <summary>
/// Flujo de enrolamiento completo, de punta a punta: WS local (Host real, TestServer) ->
/// OperationCoordinator (Core real) -> FakeSensor (Sensors real) -> BackendClient (Backend real,
/// HTTP real contra FakeBackendServer). Nada mockeado salvo el hardware y el backend NestJS.
/// </summary>
public sealed class EnrollFlowTests : AgentIntegrationTestBase
{
    [Fact]
    public async Task Enroll_completes_and_the_backend_receives_a_base64_template()
    {
        var opId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.EnrollStart, new EnrollStartPayload
        {
            OpId = opId,
            EnrollmentId = "enr-1",
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            SamplesRequired = 3,
            MinQuality = 10,
        });

        var first = await Client.ReceiveUntilAsync(MessageTypes.EnrollProgress, TimeSpan.FromSeconds(10));
        var progress = Assert.IsType<EnrollProgressPayload>(first.TypedPayload);
        Assert.Equal(opId, progress.OpId);

        var completed = await Client.ReceiveUntilAsync(MessageTypes.EnrollCompleted, TimeSpan.FromSeconds(10));
        var completedPayload = Assert.IsType<EnrollCompletedPayload>(completed.TypedPayload);
        Assert.Equal(opId, completedPayload.OpId);
        Assert.Equal("enr-1", completedPayload.EnrollmentId);
        Assert.InRange(completedPayload.FinalQuality, 0, 100);

        Assert.Single(Backend.EnrollRequestBodies);
        var body = Backend.EnrollRequestBodies.Single();
        Assert.Contains("\"enrollmentId\":\"enr-1\"", body);
        Assert.Contains("\"template\":\"", body); // base64, no vacío
        Assert.DoesNotContain("\"template\":\"\"", body);
    }

    [Fact]
    public async Task Second_enroll_right_after_the_first_completes_succeeds_proving_the_session_was_freed()
    {
        var firstOpId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.EnrollStart, new EnrollStartPayload
        {
            OpId = firstOpId,
            EnrollmentId = "enr-a",
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            SamplesRequired = 1,
            MinQuality = 10,
        });
        await Client.ReceiveUntilAsync(MessageTypes.EnrollCompleted, TimeSpan.FromSeconds(10));

        var secondOpId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.EnrollStart, new EnrollStartPayload
        {
            OpId = secondOpId,
            EnrollmentId = "enr-b",
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            SamplesRequired = 1,
            MinQuality = 10,
        });
        var secondCompleted = await Client.ReceiveUntilAsync(MessageTypes.EnrollCompleted, TimeSpan.FromSeconds(10));

        Assert.Equal(secondOpId, ((EnrollCompletedPayload)secondCompleted.TypedPayload!).OpId);
        Assert.Equal(2, Backend.EnrollRequestBodies.Count);
    }

    [Fact]
    public async Task Backend_rejecting_the_template_surfaces_as_enroll_failed()
    {
        Backend.NextEnrollStatusCode = 422; // TEMPLATE_QUALITY_TOO_LOW

        var opId = Guid.NewGuid().ToString();
        await Client.SendAsync(MessageTypes.EnrollStart, new EnrollStartPayload
        {
            OpId = opId,
            EnrollmentId = "enr-rejected",
            DeviceToken = "dev-token",
            DeviceId = "FAKE-0001",
            SamplesRequired = 1,
            MinQuality = 10,
        });

        var failed = await Client.ReceiveUntilAsync(MessageTypes.EnrollFailed, TimeSpan.FromSeconds(10));
        var payload = Assert.IsType<EnrollFailedPayload>(failed.TypedPayload);
        Assert.Equal(opId, payload.OpId);
        Assert.Equal("QUALITY_TOO_LOW", payload.Code);
    }
}
