namespace Pulso.Agent.Sensors.WbfFingerJetSensor;

public sealed record WindowsBiometricUnit(
    uint UnitId,
    string DeviceInstanceId,
    string Description,
    string Manufacturer,
    string Model,
    string SerialNumber);

public sealed record CapturedAnsi381Sample(uint UnitId, byte[] StandardDataBlock);

/// <summary>Boundary around Windows Biometric Framework so sensor behavior can be tested off Windows.</summary>
public interface IWindowsBiometricApi
{
    Task<IReadOnlyList<WindowsBiometricUnit>> EnumerateAsync(CancellationToken ct);

    Task<CapturedAnsi381Sample> CaptureAsync(uint unitId, TimeSpan timeout, CancellationToken ct);
}
