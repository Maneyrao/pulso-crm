namespace Pulso.Agent.Sensors;

/// <summary>El sensor referenciado no está enumerado / conectado.</summary>
public sealed class SensorNotFoundException(string sensorId)
    : Exception($"Sensor '{sensorId}' no encontrado o no conectado.")
{
    public string SensorId { get; } = sensorId;
}

/// <summary>El sensor se desconectó durante una operación en curso (WM_DEVICECHANGE en Windows real).</summary>
public sealed class SensorDisconnectedException(string sensorId)
    : Exception($"Sensor '{sensorId}' se desconectó.")
{
    public string SensorId { get; } = sensorId;
}
