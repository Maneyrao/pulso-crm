namespace Pulso.Agent.Sensors;

/// <summary>Estado observado de un lector.</summary>
public enum SensorStatus
{
    Online,
    Offline,
    Error,
}

/// <summary>Formato del template extraído. Debe coincidir con lo que el backend acepta (API_CONTRACTS.md §10).</summary>
public enum TemplateFormat
{
    Iso19794_2,
    Ansi378,
    VendorProprietary,
    SourceAfisNative,
}

/// <summary>Descripción de un lector enumerado, sin nada del socio.</summary>
public sealed record SensorInfo
{
    public required string SensorId { get; init; }
    public required string Vendor { get; init; }
    public required string Model { get; init; }
    public string? SerialNumber { get; init; }
    public required SensorStatus Status { get; init; }
}

public sealed class SensorEventArgs(string sensorId, string? reason = null) : EventArgs
{
    public string SensorId { get; } = sensorId;

    /// <summary>Código de motivo, p.ej. "USB_REMOVED". Nunca texto libre con datos de usuario.</summary>
    public string? Reason { get; } = reason;
}

/// <summary>
/// Una muestra cruda de una captura. <see cref="ImageData"/> vive sólo en memoria — nunca se
/// escribe a disco ni se loguea (LOCAL_AGENT_ARCHITECTURE.md §11.5). El consumidor es
/// responsable de sobrescribirla con ceros apenas termina de usarla (<see cref="Wipe"/>).
/// </summary>
public sealed class CaptureResult
{
    public required string SensorId { get; init; }
    public required DateTimeOffset CapturedAt { get; init; }
    public required byte[] ImageData { get; init; }

    /// <summary>Sobrescribe el buffer de imagen con ceros. Idempotente.</summary>
    public void Wipe() => Array.Clear(ImageData, 0, ImageData.Length);
}

/// <summary>Resultado de evaluar la calidad de una muestra (0-100).</summary>
public sealed record QualityScore
{
    public required int Value { get; init; }

    public bool Meets(int minQuality) => Value >= minQuality;
}

/// <summary>
/// Template extraído a partir de una o más muestras. <see cref="TemplateData"/> es lo único
/// que sale del agente hacia el backend; las muestras crudas nunca lo hacen.
/// </summary>
public sealed class TemplateResult
{
    public required byte[] TemplateData { get; init; }
    public required TemplateFormat Format { get; init; }
    public required int Quality { get; init; }

    /// <summary>Sobrescribe el buffer del template con ceros. Idempotente.</summary>
    public void Wipe() => Array.Clear(TemplateData, 0, TemplateData.Length);
}
