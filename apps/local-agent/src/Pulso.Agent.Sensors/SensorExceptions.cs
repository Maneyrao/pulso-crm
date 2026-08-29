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

/// <summary>WBF requires an interactive Windows session to capture from the system pool.</summary>
public sealed class InteractiveSessionRequiredException()
    : Exception("El lector requiere el conector interactivo de Windows.");
