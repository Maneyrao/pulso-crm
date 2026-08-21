using System.Runtime.Versioning;

namespace Pulso.Agent.Sensors.HidDigitalPersonaSensor;

/// <summary>
/// Stack A (LOCAL_AGENT_ARCHITECTURE.md §3): captura, extracción y opcionalmente matching vía el
/// SDK oficial HID DigitalPersona. Requiere Windows y el SDK instalado — no disponible en el
/// entorno de desarrollo actual (macOS). Ver T-7.1 en el README de este proyecto.
///
/// Este stub existe para que la solución compile y se pueda seleccionar en <c>Program.cs</c> por
/// configuración sin condicionales de compilación desperdigados por el resto del código. La
/// implementación real se escribe en la Etapa 8, en una máquina Windows, contra el SDK.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class HidDigitalPersonaSensor : IFingerprintSensor
{
    public HidDigitalPersonaSensor()
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException(
                "HidDigitalPersonaSensor (Stack A, SDK HID DigitalPersona) requiere Windows y el " +
                "SDK del fabricante instalado. No está implementado en este entorno " +
                $"({Environment.OSVersion.Platform}). Usá FakeSensor para desarrollo/tests, o " +
                "compilá y corré el agente en Windows con el SDK instalado para producción (T-7.1).");
        }

        throw new PlatformNotSupportedException(
            "HidDigitalPersonaSensor todavía no está implementado (POC pendiente de promoción a " +
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
        "HidDigitalPersonaSensor (Stack A) no está implementado en este entorno. Ver T-7.1.");
}
