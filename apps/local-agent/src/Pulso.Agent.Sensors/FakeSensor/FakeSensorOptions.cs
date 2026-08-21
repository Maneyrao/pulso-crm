namespace Pulso.Agent.Sensors.FakeSensor;

/// <summary>Configuración de <see cref="Pulso.Agent.Sensors.FakeSensor.FakeSensor"/> para tests y demos.</summary>
public sealed class FakeSensorOptions
{
    public string SensorId { get; set; } = "FAKE-0001";
    public string Vendor { get; set; } = "PULSO_FAKE";
    public string Model { get; set; } = "FakeReader";
    public string? SerialNumber { get; set; } = "FAKE-SN-0001";

    /// <summary>Latencia simulada de una captura individual.</summary>
    public TimeSpan CaptureLatency { get; set; } = TimeSpan.FromMilliseconds(50);

    /// <summary>Calidad (0-100) usada cuando no hay override por índice de muestra.</summary>
    public int DefaultQuality { get; set; } = 75;

    /// <summary>Override de calidad por índice de muestra (0-based), para simular escenarios de test.</summary>
    public Func<int, int>? QualityForSample { get; set; }

    /// <summary>Si es true, el sensor arranca desconectado (EnumerateAsync devuelve vacío).</summary>
    public bool StartOffline { get; set; }
}
