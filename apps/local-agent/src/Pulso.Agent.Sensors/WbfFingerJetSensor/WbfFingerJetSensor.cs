using System.Runtime.Versioning;

namespace Pulso.Agent.Sensors.WbfFingerJetSensor;

/// <summary>
/// Stack B (LOCAL_AGENT_ARCHITECTURE.md §3): captura vía WBF/driver de Windows + FingerJetFX OSE
/// (LGPL-3) para extracción de template; el matching 1:N corre en el backend con SourceAFIS
/// (ADR-014). Requiere Windows Biometric Framework — no disponible en macOS.
///
/// Stub para que la solución compile en cualquier SO. Implementación real en Etapa 8 sobre una
/// máquina Windows, tras cerrar V1/V5 de UAREU_4500_RESEARCH.md (ver T-7.1 en el README).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WbfFingerJetSensor : IFingerprintSensor
{
    public WbfFingerJetSensor()
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException(
                "WbfFingerJetSensor (Stack B, WBF + FingerJetFX OSE) requiere Windows Biometric " +
                $"Framework. No está implementado en este entorno ({Environment.OSVersion.Platform}). " +
                "Usá FakeSensor para desarrollo/tests, o compilá y corré el agente en Windows para " +
                "producción (T-7.1).");
        }

        throw new PlatformNotSupportedException(
            "WbfFingerJetSensor todavía no está implementado (POC pendiente de promoción a " +
            "producción, ver LOCAL_AGENT_ARCHITECTURE.md §13, Etapa 8).");
    }

    public event EventHandler<SensorEventArgs> SensorConnected
    {
        add => throw NotImplemented();
        remove => throw NotImplemented();
    }

    public event EventHandler<SensorEventArgs> SensorDisconnected
    {
        add => throw NotImplemented();
        remove => throw NotImplemented();
    }

    public Task<IReadOnlyList<SensorInfo>> EnumerateAsync(CancellationToken ct) => throw NotImplemented();

    public Task<CaptureResult> CaptureAsync(string sensorId, TimeSpan timeout, CancellationToken ct) =>
        throw NotImplemented();

    public QualityScore EvaluateQuality(CaptureResult sample) => throw NotImplemented();

    public Task<TemplateResult> CreateTemplateAsync(
        IReadOnlyList<CaptureResult> samples,
        TemplateFormat fmt,
        CancellationToken ct) => throw NotImplemented();

    private static PlatformNotSupportedException NotImplemented() => new(
        "WbfFingerJetSensor (Stack B) no está implementado en este entorno. Ver T-7.1.");
}
