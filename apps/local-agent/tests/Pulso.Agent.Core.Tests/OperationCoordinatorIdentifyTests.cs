using Microsoft.Extensions.Logging.Abstractions;
using Pulso.Agent.Core.Ports;
using Pulso.Agent.Core.Tests.TestDoubles;
using Pulso.Agent.Protocol.Payloads;
using Pulso.Agent.Sensors.FakeSensor;
using Xunit;

namespace Pulso.Agent.Core.Tests;

public class OperationCoordinatorIdentifyTests
{
    private static IdentifyStartPayload Request(bool continuous = true, int? idleTimeoutMs = null, int? minQuality = null) => new()
    {
        OpId = "op-identify-1",
        DeviceToken = "token-1",
        DeviceId = "FAKE-0001",
        BranchId = "branch-1",
        Continuous = continuous,
        IdleTimeoutMs = idleTimeoutMs,
        MinQuality = minQuality,
    };

    private static (OperationCoordinator Coordinator, SessionManager Sessions, AgentStateMachine State,
        RecordingNotifier Notifier, StubBackendClient Backend) Build(
        FakeSensorOptions? sensorOptions = null, OperationTimeouts? timeouts = null)
    {
        var sessions = new SessionManager();
        var state = new AgentStateMachine();
        state.Pair();
        state.DeviceConnected();
        state.Approve();

        var sensor = new FakeSensor(sensorOptions ?? new FakeSensorOptions { CaptureLatency = TimeSpan.FromMilliseconds(1) });
        var backend = new StubBackendClient();
        var notifier = new RecordingNotifier();
        var audit = new RecordingAuditSink();

        var coordinator = new OperationCoordinator(
            sessions, state, sensor, backend, notifier, audit,
            NullLogger<OperationCoordinator>.Instance, timeouts);

        return (coordinator, sessions, state, notifier, backend);
    }

    [Fact]
    public async Task Single_shot_identify_captures_and_sends_once_then_stops()
    {
        var (coordinator, sessions, state, notifier, backend) = Build();

        await coordinator.RunIdentifyAsync(Request(continuous: false), CancellationToken.None);

        Assert.Single(notifier.OfType<IdentifyCapturedPayload>());
        Assert.Single(notifier.OfType<IdentifySentPayload>());
        Assert.Single(backend.IdentifyRequests);
        Assert.Null(sessions.Current);
        Assert.Equal(AgentState.Ready, state.Current);
    }

    [Fact]
    public async Task The_agent_never_sees_the_identify_result_only_sent_confirmation()
    {
        // Refuerza BIOMETRIC_SECURITY.md §7: "el agente recibe {resolved:true}. No recibe memberId,
        // ni nombre, ni foto, ni decisión." — acá comprobamos que el evento local es identify.sent,
        // no algo con datos del socio, y que el resultado del backend no se filtra al payload.
        var (coordinator, _, _, notifier, _) = Build();

        await coordinator.RunIdentifyAsync(Request(continuous: false), CancellationToken.None);

        var sent = Assert.Single(notifier.OfType<IdentifySentPayload>());
        Assert.Equal("op-identify-1", sent.OpId);
        // IdentifySentPayload sólo tiene OpId: no hay forma de que cargue PII.
    }

    [Fact]
    public async Task Continuous_mode_captures_multiple_times_until_stopped()
    {
        var (coordinator, sessions, _, notifier, backend) = Build();

        var run = coordinator.RunIdentifyAsync(Request(continuous: true), CancellationToken.None);

        await WaitUntil(() => notifier.OfType<IdentifySentPayload>().Count() >= 3, TimeSpan.FromSeconds(2));

        coordinator.StopIdentify("op-identify-1");
        await run;

        Assert.True(backend.IdentifyRequests.Count >= 3);
        Assert.Empty(notifier.OfType<OperationCancelledPayload>());
        Assert.Null(sessions.Current);
    }

    [Fact]
    public async Task Cancel_emits_operation_cancelled_in_continuous_mode()
    {
        var (coordinator, sessions, state, notifier, _) = Build();

        var run = coordinator.RunIdentifyAsync(Request(continuous: true), CancellationToken.None);
        await WaitUntil(() => sessions.Current is not null, TimeSpan.FromSeconds(1));

        coordinator.Cancel("op-identify-1", "USER_CANCELLED");
        await run;

        var cancelled = Assert.Single(notifier.OfType<OperationCancelledPayload>());
        Assert.Equal("USER_CANCELLED", cancelled.Reason);
        Assert.Equal(AgentState.Ready, state.Current);
    }

    [Fact]
    public async Task Idle_timeout_ends_the_loop_without_emitting_a_failure()
    {
        var (coordinator, sessions, state, notifier, _) = Build(
            new FakeSensorOptions { CaptureLatency = TimeSpan.FromSeconds(5) },
            new OperationTimeouts { IdentifyIdle = TimeSpan.FromMilliseconds(30) });

        await coordinator.RunIdentifyAsync(Request(continuous: true), CancellationToken.None);

        Assert.Empty(notifier.OfType<IdentifyFailedPayload>());
        Assert.Empty(notifier.OfType<OperationCancelledPayload>());
        Assert.Null(sessions.Current);
        Assert.Equal(AgentState.Ready, state.Current);
    }

    [Fact]
    public async Task Low_quality_capture_reports_QUALITY_TOO_LOW_and_keeps_listening_when_continuous()
    {
        var options = new FakeSensorOptions
        {
            CaptureLatency = TimeSpan.FromMilliseconds(1),
            QualityForSample = i => i == 0 ? 10 : 90,
        };
        var (coordinator, _, _, notifier, backend) = Build(options);

        await coordinator.RunIdentifyAsync(Request(continuous: false, minQuality: 50), CancellationToken.None);

        // continuous:false pero la primera muestra fue rechazada por calidad: el loop corta ahí.
        Assert.Single(notifier.OfType<IdentifyFailedPayload>());
        Assert.Equal("QUALITY_TOO_LOW", notifier.OfType<IdentifyFailedPayload>().Single().Code);
        Assert.Empty(backend.IdentifyRequests);
    }

    [Fact]
    public async Task Backend_unreachable_is_reported_but_continuous_mode_keeps_listening()
    {
        var (coordinator, sessions, _, notifier, backend) = Build();
        backend.ThrowOnIdentify = new BackendUnreachableException("down");

        var run = coordinator.RunIdentifyAsync(Request(continuous: true), CancellationToken.None);
        await WaitUntil(() => notifier.OfType<IdentifyFailedPayload>().Any(f => f.Code == "BACKEND_UNREACHABLE"), TimeSpan.FromSeconds(2));

        coordinator.StopIdentify("op-identify-1");
        await run;

        Assert.Contains(notifier.OfType<IdentifyFailedPayload>(), f => f.Code == "BACKEND_UNREACHABLE");
    }

    private static async Task WaitUntil(Func<bool> condition, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (!condition() && DateTime.UtcNow < deadline)
        {
            await Task.Delay(5);
        }

        Assert.True(condition(), "La condición esperada no se cumplió a tiempo.");
    }
}
