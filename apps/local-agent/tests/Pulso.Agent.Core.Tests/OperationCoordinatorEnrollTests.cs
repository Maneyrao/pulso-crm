using Microsoft.Extensions.Logging.Abstractions;
using System.Diagnostics;
using Pulso.Agent.Core.Ports;
using Pulso.Agent.Core.Tests.TestDoubles;
using Pulso.Agent.Protocol.Payloads;
using Pulso.Agent.Sensors;
using Pulso.Agent.Sensors.FakeSensor;
using Xunit;

namespace Pulso.Agent.Core.Tests;

public class OperationCoordinatorEnrollTests
{
    private static EnrollStartPayload Request(int samplesRequired = 3, int minQuality = 50) => new()
    {
        OpId = "op-enroll-1",
        EnrollmentId = "enr-1",
        DeviceToken = "token-1",
        DeviceId = "FAKE-0001",
        SamplesRequired = samplesRequired,
        MinQuality = minQuality,
    };

    private static (OperationCoordinator Coordinator, SessionManager Sessions, AgentStateMachine State,
        RecordingNotifier Notifier, StubBackendClient Backend, RecordingAuditSink Audit) Build(
        FakeSensorOptions? sensorOptions = null, OperationTimeouts? timeouts = null)
    {
        timeouts ??= new OperationTimeouts { BetweenEnrollmentSamples = TimeSpan.Zero };
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

        return (coordinator, sessions, state, notifier, backend, audit);
    }

    private static (OperationCoordinator Coordinator, RecordingNotifier Notifier) BuildWithSensor(IFingerprintSensor sensor)
    {
        var sessions = new SessionManager();
        var state = new AgentStateMachine();
        state.Pair();
        state.DeviceConnected();
        state.Approve();
        var notifier = new RecordingNotifier();
        var coordinator = new OperationCoordinator(
            sessions, state, sensor, new StubBackendClient(), notifier, new RecordingAuditSink(),
            NullLogger<OperationCoordinator>.Instance,
            new OperationTimeouts { BetweenEnrollmentSamples = TimeSpan.Zero });
        return (coordinator, notifier);
    }

    [Fact]
    public async Task Happy_path_captures_required_samples_and_completes()
    {
        var (coordinator, sessions, state, notifier, backend, audit) = Build();

        await coordinator.RunEnrollAsync(Request(samplesRequired: 3), CancellationToken.None);

        var completed = Assert.Single(notifier.OfType<EnrollCompletedPayload>());
        Assert.Equal("op-enroll-1", completed.OpId);
        Assert.Equal("enr-1", completed.EnrollmentId);

        var progress = notifier.OfType<EnrollProgressPayload>().ToList();
        Assert.True(progress.Count >= 3);
        Assert.Equal(3, progress.Max(p => p.Captured));

        Assert.Single(backend.EnrollRequests);
        Assert.Null(sessions.Current);
        Assert.Equal(AgentState.Ready, state.Current);
        Assert.Contains(audit.Records, r => r.Type == AuditEventTypes.EnrollSent);
    }

    [Fact]
    public async Task Enrollment_leaves_a_finger_lift_interval_between_valid_samples()
    {
        var timeouts = new OperationTimeouts
        {
            BetweenEnrollmentSamples = TimeSpan.FromMilliseconds(30),
        };
        var (coordinator, _, _, notifier, _, _) = Build(timeouts: timeouts);
        var stopwatch = Stopwatch.StartNew();

        await coordinator.RunEnrollAsync(Request(samplesRequired: 3), CancellationToken.None);

        stopwatch.Stop();
        Assert.True(stopwatch.Elapsed >= TimeSpan.FromMilliseconds(55));
        Assert.Equal(2, notifier.OfType<EnrollProgressPayload>().Count(progress => progress.Prompt == "LIFT_FINGER"));
    }

    [Fact]
    public async Task Low_quality_samples_do_not_count_but_are_reported_as_warnings()
    {
        // Calidad 30 en la muestra 0 y 2 (bajo minQuality=50), buena en el resto.
        var options = new FakeSensorOptions
        {
            CaptureLatency = TimeSpan.FromMilliseconds(1),
            QualityForSample = i => i is 0 or 2 ? 30 : 80,
        };
        var (coordinator, _, _, notifier, _, audit) = Build(options);

        await coordinator.RunEnrollAsync(Request(samplesRequired: 2, minQuality: 50), CancellationToken.None);

        Assert.Single(notifier.OfType<EnrollCompletedPayload>());
        Assert.Contains(notifier.OfType<EnrollProgressPayload>(), p => p.Warning == "LOW_QUALITY");
        Assert.Contains(audit.Records, r => r.Type == AuditEventTypes.QualityRejected);
    }

    [Fact]
    public async Task Five_consecutive_low_quality_samples_fail_with_QUALITY_TOO_LOW()
    {
        var options = new FakeSensorOptions { CaptureLatency = TimeSpan.FromMilliseconds(1), DefaultQuality = 10 };
        var (coordinator, sessions, state, notifier, _, _) = Build(options);

        await coordinator.RunEnrollAsync(Request(samplesRequired: 4, minQuality: 50), CancellationToken.None);

        var failed = Assert.Single(notifier.OfType<EnrollFailedPayload>());
        Assert.Equal("QUALITY_TOO_LOW", failed.Code);
        Assert.Null(sessions.Current);
        Assert.Equal(AgentState.Ready, state.Current);
    }

    [Fact]
    public async Task Second_operation_while_one_is_active_gets_AgentBusyException()
    {
        var (coordinator, sessions, _, _, _, _) = Build(new FakeSensorOptions { CaptureLatency = TimeSpan.FromSeconds(5) });

        var first = coordinator.RunEnrollAsync(Request(), CancellationToken.None);

        Assert.Throws<AgentBusyException>(() => sessions.Begin("op-other", OperationKind.Identify));

        sessions.CancelCurrent("test cleanup");
        await first;
    }

    [Fact]
    public async Task Backend_rejection_maps_to_enroll_failed_with_translated_code()
    {
        var (coordinator, _, _, notifier, backend, _) = Build();
        backend.ThrowOnEnroll = new BackendRejectedException("TEMPLATE_QUALITY_TOO_LOW", "rejected");

        await coordinator.RunEnrollAsync(Request(samplesRequired: 1), CancellationToken.None);

        var failed = Assert.Single(notifier.OfType<EnrollFailedPayload>());
        Assert.Equal("QUALITY_TOO_LOW", failed.Code);
    }

    [Fact]
    public async Task Backend_unreachable_maps_to_BACKEND_UNREACHABLE()
    {
        var (coordinator, _, _, notifier, backend, _) = Build();
        backend.ThrowOnEnroll = new BackendUnreachableException("network down");

        await coordinator.RunEnrollAsync(Request(samplesRequired: 1), CancellationToken.None);

        var failed = Assert.Single(notifier.OfType<EnrollFailedPayload>());
        Assert.Equal("BACKEND_UNREACHABLE", failed.Code);
    }

    [Fact]
    public async Task Cancel_emits_operation_cancelled_and_frees_the_session()
    {
        var (coordinator, sessions, state, notifier, _, _) = Build(new FakeSensorOptions { CaptureLatency = TimeSpan.FromSeconds(5) });

        var run = coordinator.RunEnrollAsync(Request(), CancellationToken.None);
        coordinator.Cancel("op-enroll-1", "USER_CANCELLED");
        await run;

        var cancelled = Assert.Single(notifier.OfType<OperationCancelledPayload>());
        Assert.Equal("USER_CANCELLED", cancelled.Reason);
        Assert.Null(sessions.Current);
        Assert.Equal(AgentState.Ready, state.Current);
    }

    [Fact]
    public async Task Enroll_session_timeout_emits_TIMEOUT()
    {
        var (coordinator, _, _, notifier, _, _) = Build(
            new FakeSensorOptions { CaptureLatency = TimeSpan.FromSeconds(5) },
            new OperationTimeouts { EnrollSession = TimeSpan.FromMilliseconds(50) });

        await coordinator.RunEnrollAsync(Request(), CancellationToken.None);

        var failed = Assert.Single(notifier.OfType<EnrollFailedPayload>());
        Assert.Equal("TIMEOUT", failed.Code);
    }

    [Fact]
    public async Task Single_capture_timeout_emits_TIMEOUT_without_waiting_the_full_session_budget()
    {
        var (coordinator, _, _, notifier, _, _) = Build(
            new FakeSensorOptions { CaptureLatency = TimeSpan.FromSeconds(5) },
            new OperationTimeouts { Capture = TimeSpan.FromMilliseconds(20), EnrollSession = TimeSpan.FromSeconds(30) });

        await coordinator.RunEnrollAsync(Request(), CancellationToken.None);

        var failed = Assert.Single(notifier.OfType<EnrollFailedPayload>());
        Assert.Equal("TIMEOUT", failed.Code);
    }

    [Fact]
    public async Task Non_interactive_WBF_session_explains_that_the_connector_must_run_in_the_user_session()
    {
        var (coordinator, notifier) = BuildWithSensor(new InteractiveRequiredSensor());

        await coordinator.RunEnrollAsync(Request(samplesRequired: 1), CancellationToken.None);

        var failed = Assert.Single(notifier.OfType<EnrollFailedPayload>());
        Assert.Equal("INTERACTIVE_SESSION_REQUIRED", failed.Code);
    }

    [Fact]
    public async Task Template_buffer_is_zeroed_after_the_operation_ends()
    {
        var (coordinator, _, _, _, backend, _) = Build();

        await coordinator.RunEnrollAsync(Request(samplesRequired: 1), CancellationToken.None);

        // StubBackendClient guarda la misma referencia de array que recibió: si el coordinator la
        // sobrescribe con ceros al terminar (§11.6), acá se ve reflejado.
        var sentTemplate = backend.EnrollRequests.Single().Template;
        Assert.NotEmpty(sentTemplate);
        Assert.All(sentTemplate, b => Assert.Equal(0, b));
    }

    private sealed class InteractiveRequiredSensor : IFingerprintSensor
    {
        public event EventHandler<SensorEventArgs>? SensorConnected
        {
            add { }
            remove { }
        }

        public event EventHandler<SensorEventArgs>? SensorDisconnected
        {
            add { }
            remove { }
        }

        public Task<IReadOnlyList<SensorInfo>> EnumerateAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<SensorInfo>>(
            [new SensorInfo { SensorId = "WBF-1", Vendor = "HID", Model = "U.are.U 4500", Status = SensorStatus.Online }]);

        public Task<CaptureResult> CaptureAsync(string sensorId, TimeSpan timeout, CancellationToken ct) =>
            throw new InteractiveSessionRequiredException();

        public QualityScore EvaluateQuality(CaptureResult sample) => new() { Value = 100 };

        public Task<TemplateResult> CreateTemplateAsync(IReadOnlyList<CaptureResult> samples, TemplateFormat fmt, CancellationToken ct) =>
            throw new NotSupportedException();
    }
}
