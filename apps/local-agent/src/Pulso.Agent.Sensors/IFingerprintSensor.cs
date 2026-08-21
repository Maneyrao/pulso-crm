namespace Pulso.Agent.Sensors;

/// <summary>
/// Abstrae el hardware de captura biométrica (LOCAL_AGENT_ARCHITECTURE.md §3). El resto del
/// agente (Core, Host) sólo conoce esta interfaz; nunca un SDK de fabricante concreto.
/// Implementaciones: <c>HidDigitalPersonaSensor</c> (Stack A, Windows), <c>WbfFingerJetSensor</c>
/// (Stack B, Windows), <c>FakeSensor</c> (tests y demos sin hardware).
/// </summary>
public interface IFingerprintSensor
{
    Task<IReadOnlyList<SensorInfo>> EnumerateAsync(CancellationToken ct);

    event EventHandler<SensorEventArgs> SensorConnected;

    event EventHandler<SensorEventArgs> SensorDisconnected;

    Task<CaptureResult> CaptureAsync(string sensorId, TimeSpan timeout, CancellationToken ct);

    QualityScore EvaluateQuality(CaptureResult sample);

    Task<TemplateResult> CreateTemplateAsync(
        IReadOnlyList<CaptureResult> samples,
        TemplateFormat fmt,
        CancellationToken ct);
}
