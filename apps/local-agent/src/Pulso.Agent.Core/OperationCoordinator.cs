using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Pulso.Agent.Core.Ports;
using Pulso.Agent.Protocol;
using Pulso.Agent.Protocol.Payloads;
using Pulso.Agent.Sensors;

namespace Pulso.Agent.Core;

/// <summary>
/// Máquina de estados de enrolamiento e identificación (LOCAL_AGENT_ARCHITECTURE.md §4-§5, §7).
/// Orquesta IFingerprintSensor + IBiometricBackendClient, aplica los timeouts documentados,
/// notifica progreso por IOperationNotifier y garantiza limpieza de buffers al terminar
/// (§11.6: "Buffers sobrescritos al terminar cada operación").
/// </summary>
public sealed class OperationCoordinator(
    SessionManager sessions,
    AgentStateMachine stateMachine,
    IFingerprintSensor sensor,
    IBiometricBackendClient backend,
    IOperationNotifier notifier,
    IAgentAuditSink audit,
    ILogger<OperationCoordinator> logger,
    OperationTimeouts? timeouts = null)
{
    /// <summary>Muestras de baja calidad consecutivas antes de abortar un enrolamiento (§9.2 del protocolo).</summary>
    private const int MaxConsecutiveLowQuality = 5;

    private readonly OperationTimeouts _timeouts = timeouts ?? new OperationTimeouts();

    /// <summary>
    /// Marca por opId por qué se pidió cancelar: un valor no-nulo dispara operation.cancelled;
    /// null (identify.stop) termina el loop sin emitir mensaje — WEBSOCKET_PROTOCOL.md no define
    /// una respuesta para identify.stop, a diferencia de operation.cancel.
    /// </summary>
    private readonly ConcurrentDictionary<string, string?> _cancelReasons = new();

    public async Task RunEnrollAsync(EnrollStartPayload request, CancellationToken externalCt)
    {
        var handle = await sessions.BeginAsync(request.OpId, OperationKind.Enroll, _timeouts.TeardownGrace, externalCt)
            .ConfigureAwait(false);
        stateMachine.OperationStarted();
        audit.Record(AuditEventTypes.CaptureStarted, AuditSeverity.Info, "enroll started",
            new Dictionary<string, string> { ["opId"] = request.OpId, ["enrollmentId"] = request.EnrollmentId });

        var samples = new List<CaptureResult>();
        using var timeoutCts = new CancellationTokenSource(_timeouts.EnrollSession);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(externalCt, handle.Cts.Token, timeoutCts.Token);

        try
        {
            var localSensorId = await ResolveLocalSensorIdAsync(linked.Token).ConfigureAwait(false);
            notifier.EnrollProgress(new EnrollProgressPayload
            {
                OpId = request.OpId,
                Captured = 0,
                Required = request.SamplesRequired,
                Prompt = "PLACE_FINGER",
            });

            var consecutiveLowQuality = 0;
            while (samples.Count < request.SamplesRequired)
            {
                CaptureResult sample;
                try
                {
                    sample = await sensor.CaptureAsync(localSensorId, _timeouts.Capture, linked.Token)
                        .ConfigureAwait(false);
                }
                catch (SensorDisconnectedException)
                {
                    throw new EnrollOperationException("DEVICE_DISCONNECTED", "El lector se desconectó durante la captura.");
                }
                catch (InteractiveSessionRequiredException)
                {
                    throw new EnrollOperationException(
                        "INTERACTIVE_SESSION_REQUIRED",
                        "Abrí el conector El Templo Huella desde la sesión de Windows y reintentá.");
                }
                catch (TimeoutException)
                {
                    audit.Record(AuditEventTypes.CaptureTimeout, AuditSeverity.Warn, "capture timeout",
                        new Dictionary<string, string> { ["opId"] = request.OpId });
                    throw new EnrollOperationException("TIMEOUT", "Se agotó el tiempo de una captura.");
                }

                var quality = sensor.EvaluateQuality(sample);
                if (!quality.Meets(request.MinQuality))
                {
                    consecutiveLowQuality++;
                    sample.Wipe();
                    audit.Record(AuditEventTypes.QualityRejected, AuditSeverity.Warn, "low quality sample",
                        new Dictionary<string, string> { ["opId"] = request.OpId, ["quality"] = quality.Value.ToString() });
                    notifier.EnrollProgress(new EnrollProgressPayload
                    {
                        OpId = request.OpId,
                        Captured = samples.Count,
                        Required = request.SamplesRequired,
                        LastQuality = quality.Value,
                        Warning = "LOW_QUALITY",
                        Prompt = "CLEAN_SENSOR",
                    });

                    if (consecutiveLowQuality >= MaxConsecutiveLowQuality)
                    {
                        throw new EnrollOperationException("QUALITY_TOO_LOW", "Demasiadas muestras de baja calidad consecutivas.");
                    }

                    continue;
                }

                consecutiveLowQuality = 0;
                samples.Add(sample);
                notifier.EnrollProgress(new EnrollProgressPayload
                {
                    OpId = request.OpId,
                    Captured = samples.Count,
                    Required = request.SamplesRequired,
                    LastQuality = quality.Value,
                    Prompt = samples.Count < request.SamplesRequired ? "LIFT_FINGER" : null,
                });

                if (samples.Count < request.SamplesRequired && _timeouts.BetweenEnrollmentSamples > TimeSpan.Zero)
                {
                    await Task.Delay(_timeouts.BetweenEnrollmentSamples, linked.Token).ConfigureAwait(false);
                }
            }

            var template = await sensor.CreateTemplateAsync(samples, ResolveTemplateFormat(), linked.Token)
                .ConfigureAwait(false);
            try
            {
                audit.Record(AuditEventTypes.EnrollSent, AuditSeverity.Info, "enroll template sent",
                    new Dictionary<string, string> { ["opId"] = request.OpId, ["enrollmentId"] = request.EnrollmentId });

                EnrollCompleteResult result;
                try
                {
                    result = await backend.CompleteEnrollAsync(
                        request.DeviceToken,
                        new EnrollCompleteRequest
                        {
                            EnrollmentId = request.EnrollmentId,
                            Template = template.TemplateData,
                            Format = template.Format,
                            Quality = template.Quality,
                        },
                        linked.Token).ConfigureAwait(false);
                }
                catch (BackendRejectedException ex)
                {
                    throw new EnrollOperationException(MapBackendCode(ex.Code), ex.Message);
                }
                catch (BackendUnreachableException ex)
                {
                    throw new EnrollOperationException("BACKEND_UNREACHABLE", ex.Message);
                }

                if (!result.Ok)
                {
                    throw new EnrollOperationException("BACKEND_REJECTED", "El backend no confirmó el enrolamiento.");
                }

                notifier.EnrollCompleted(new EnrollCompletedPayload
                {
                    OpId = request.OpId,
                    EnrollmentId = request.EnrollmentId,
                    FinalQuality = template.Quality,
                });
            }
            finally
            {
                template.Wipe();
            }
        }
        catch (OperationCanceledException) when (handle.Cts.IsCancellationRequested)
        {
            HandleCancellation(request.OpId, isEnroll: true);
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
        {
            notifier.EnrollFailed(new EnrollFailedPayload
            {
                OpId = request.OpId,
                Code = "TIMEOUT",
                Detail = "Se agotó el tiempo de la sesión de enrolamiento (120s).",
            });
        }
        catch (EnrollOperationException ex)
        {
            notifier.EnrollFailed(new EnrollFailedPayload { OpId = request.OpId, Code = ex.Code, Detail = ex.Message });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error interno durante enroll.start (opId={OpId})", request.OpId);
            notifier.EnrollFailed(new EnrollFailedPayload { OpId = request.OpId, Code = "INTERNAL_ERROR", Detail = "Error interno del agente." });
        }
        finally
        {
            foreach (var s in samples)
            {
                s.Wipe();
            }

            _cancelReasons.TryRemove(request.OpId, out _);
            stateMachine.OperationEnded();
            // El slot se libera al final: BeginAsync no puede observar una
            // sesión libre mientras la máquina pública todavía sigue Busy.
            sessions.End(request.OpId);
        }
    }

    public async Task RunIdentifyAsync(IdentifyStartPayload request, CancellationToken externalCt)
    {
        var handle = await sessions.BeginAsync(request.OpId, OperationKind.Identify, _timeouts.TeardownGrace, externalCt)
            .ConfigureAwait(false);
        stateMachine.OperationStarted();
        var idleTimeout = request.IdleTimeoutMs is int ms && ms > 0
            ? TimeSpan.FromMilliseconds(ms)
            : _timeouts.IdentifyIdle;
        var continuous = request.Continuous ?? true;
        var minQuality = request.MinQuality ?? 0;

        using var linked = CancellationTokenSource.CreateLinkedTokenSource(externalCt, handle.Cts.Token);

        try
        {
            var localSensorId = await ResolveLocalSensorIdAsync(linked.Token).ConfigureAwait(false);
            var keepListening = true;
            while (keepListening)
            {
                using var idleCts = new CancellationTokenSource(idleTimeout);
                using var combined = CancellationTokenSource.CreateLinkedTokenSource(linked.Token, idleCts.Token);

                CaptureResult sample;
                try
                {
                    sample = await sensor.CaptureAsync(localSensorId, _timeouts.Capture, combined.Token)
                        .ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (idleCts.IsCancellationRequested && !linked.IsCancellationRequested)
                {
                    // Inactividad >= idleTimeout: fin normal del modo continuo, sin mensaje de error (§7).
                    break;
                }
                catch (SensorDisconnectedException)
                {
                    notifier.IdentifyFailed(new IdentifyFailedPayload { OpId = request.OpId, Code = "DEVICE_DISCONNECTED" });
                    break;
                }
                catch (InteractiveSessionRequiredException)
                {
                    notifier.IdentifyFailed(new IdentifyFailedPayload { OpId = request.OpId, Code = "INTERACTIVE_SESSION_REQUIRED" });
                    break;
                }
                catch (TimeoutException)
                {
                    notifier.IdentifyFailed(new IdentifyFailedPayload { OpId = request.OpId, Code = "TIMEOUT" });
                    if (!continuous)
                    {
                        break;
                    }

                    continue;
                }

                var quality = sensor.EvaluateQuality(sample);
                if (!quality.Meets(minQuality))
                {
                    sample.Wipe();
                    notifier.IdentifyFailed(new IdentifyFailedPayload { OpId = request.OpId, Code = "QUALITY_TOO_LOW" });
                    if (!continuous)
                    {
                        break;
                    }

                    continue;
                }

                notifier.IdentifyCaptured(new IdentifyCapturedPayload { OpId = request.OpId, Quality = quality.Value });

                var template = await sensor.CreateTemplateAsync([sample], ResolveTemplateFormat(), linked.Token)
                    .ConfigureAwait(false);
                try
                {
                    audit.Record(AuditEventTypes.IdentifySent, AuditSeverity.Info, "identify template sent",
                        new Dictionary<string, string> { ["opId"] = request.OpId, ["branchId"] = request.BranchId });

                    await backend.SubmitIdentifyAsync(
                        request.DeviceToken,
                        new IdentifyRequest
                        {
                            BranchId = request.BranchId,
                            DeviceId = request.DeviceId,
                            Template = template.TemplateData,
                            Format = template.Format,
                            Quality = template.Quality,
                            CapturedAt = sample.CapturedAt,
                        },
                        linked.Token).ConfigureAwait(false);

                    // El resultado NO viaja por acá: llega al navegador por el WS del backend (§5.3).
                    notifier.IdentifySent(new IdentifySentPayload { OpId = request.OpId });
                }
                catch (BackendRejectedException ex)
                {
                    notifier.IdentifyFailed(new IdentifyFailedPayload { OpId = request.OpId, Code = MapBackendCode(ex.Code) });
                }
                catch (BackendUnreachableException)
                {
                    notifier.IdentifyFailed(new IdentifyFailedPayload { OpId = request.OpId, Code = "BACKEND_UNREACHABLE" });
                }
                finally
                {
                    template.Wipe();
                }

                keepListening = continuous;
            }
        }
        catch (OperationCanceledException) when (handle.Cts.IsCancellationRequested)
        {
            HandleCancellation(request.OpId, isEnroll: false);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error interno durante identify.start (opId={OpId})", request.OpId);
            notifier.IdentifyFailed(new IdentifyFailedPayload { OpId = request.OpId, Code = "INTERNAL_ERROR" });
        }
        finally
        {
            _cancelReasons.TryRemove(request.OpId, out _);
            stateMachine.OperationEnded();
            sessions.End(request.OpId);
        }
    }

    /// <summary>operation.cancel: siempre responde operation.cancelled, incluso con el lector colgado
    /// (el timeout de captura es la red de seguridad, §6.1).</summary>
    public void Cancel(string opId, string reason)
    {
        _cancelReasons[opId] = reason;
        CancelHandle(opId);
    }

    /// <summary>identify.stop: termina el loop sin emitir operation.cancelled (no está en el catálogo
    /// como respuesta a este mensaje, WEBSOCKET_PROTOCOL.md §6.1).</summary>
    public void StopIdentify(string opId)
    {
        _cancelReasons[opId] = null;
        CancelHandle(opId);
    }

    private void CancelHandle(string opId)
    {
        var current = sessions.Current;
        if (current is null || current.OpId != opId)
        {
            return;
        }

        if (!current.Cts.IsCancellationRequested)
        {
            current.Cts.Cancel();
        }
    }

    private void HandleCancellation(string opId, bool isEnroll)
    {
        audit.Record(AuditEventTypes.CaptureCancelled, AuditSeverity.Info, "operation cancelled",
            new Dictionary<string, string> { ["opId"] = opId });

        if (_cancelReasons.TryGetValue(opId, out var reason) && reason is not null)
        {
            notifier.OperationCancelled(new OperationCancelledPayload { OpId = opId, Reason = reason });
        }

        // reason == null (identify.stop): fin silencioso, sin mensaje — comportamiento intencional.
    }

    private async Task<string> ResolveLocalSensorIdAsync(CancellationToken ct)
    {
        var devices = await sensor.EnumerateAsync(ct).ConfigureAwait(false);
        var online = devices.FirstOrDefault(device => device.Status == SensorStatus.Online);
        if (online is null)
        {
            throw new SensorDisconnectedException("NO_LOCAL_SENSOR");
        }

        return online.SensorId;
    }

    private static string MapBackendCode(string backendCode) => backendCode switch
    {
        "INVALID_DEVICE_TOKEN" => "INVALID_TOKEN",
        "AGENT_REVOKED" => "AGENT_DISABLED",
        "TEMPLATE_QUALITY_TOO_LOW" => "QUALITY_TOO_LOW",
        "RATE_LIMITED" => "BACKEND_REJECTED",
        _ => "BACKEND_REJECTED",
    };

    private TemplateFormat ResolveTemplateFormat() => sensor is Pulso.Agent.Sensors.FakeSensor.FakeSensor
        ? TemplateFormat.Iso19794_2
        : TemplateFormat.SourceAfisNative;
}

/// <summary>Falla de negocio dentro de un enrolamiento; se traduce 1:1 a enroll.failed.</summary>
internal sealed class EnrollOperationException(string code, string detail) : Exception(detail)
{
    public string Code { get; } = code;
}
