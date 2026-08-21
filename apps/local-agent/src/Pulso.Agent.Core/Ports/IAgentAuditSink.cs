namespace Pulso.Agent.Core.Ports;

public static class AuditSeverity
{
    public const string Info = "INFO";
    public const string Warn = "WARN";
    public const string Error = "ERROR";
}

/// <summary>Subconjunto de AgentAuditEvent.type relevante para Core (DATA_MODEL.md §7).</summary>
public static class AuditEventTypes
{
    public const string CaptureStarted = "CAPTURE_STARTED";
    public const string CaptureTimeout = "CAPTURE_TIMEOUT";
    public const string CaptureCancelled = "CAPTURE_CANCELLED";
    public const string QualityRejected = "QUALITY_REJECTED";
    public const string IdentifySent = "IDENTIFY_SENT";
    public const string EnrollSent = "ENROLL_SENT";
    public const string ProtocolError = "PROTOCOL_ERROR";
}

/// <summary>
/// Puerto de auditoría. Implementado por Pulso.Agent.Backend.AuditBuffer (lote cada 60s o 50
/// eventos). <b>Prohibido</b> pasar por acá imágenes, templates, deviceToken o cualquier PII
/// (BIOMETRIC_SECURITY.md §9.2) — sólo opId/enrollmentId, códigos y duraciones.
/// </summary>
public interface IAgentAuditSink
{
    void Record(string type, string severity, string message, IReadOnlyDictionary<string, string>? metadata = null);
}
