namespace Pulso.Agent.Protocol;

/// <summary>
/// Catálogo de "type" del protocolo (WEBSOCKET_PROTOCOL.md §6). Las cadenas son el valor
/// exacto que va en el campo "type" del sobre; no traducir ni renombrar.
/// </summary>
public static class MessageTypes
{
    // Cliente -> Agente
    public const string Hello = "hello";
    public const string StatusGet = "status.get";
    public const string EnrollStart = "enroll.start";
    public const string IdentifyStart = "identify.start";
    public const string IdentifyStop = "identify.stop";
    public const string OperationCancel = "operation.cancel";
    public const string Ping = "ping";

    // Agente -> Cliente
    public const string HelloAck = "hello.ack";
    public const string Status = "status";
    public const string DeviceConnected = "device.connected";
    public const string DeviceDisconnected = "device.disconnected";
    public const string EnrollProgress = "enroll.progress";
    public const string EnrollCompleted = "enroll.completed";
    public const string EnrollFailed = "enroll.failed";
    public const string IdentifyCaptured = "identify.captured";
    public const string IdentifySent = "identify.sent";
    public const string IdentifyFailed = "identify.failed";
    public const string OperationCancelled = "operation.cancelled";
    public const string SessionReplaced = "session.replaced";
    public const string Error = "error";
    public const string Pong = "pong";

    public static readonly IReadOnlySet<string> All = new HashSet<string>
    {
        Hello, StatusGet, EnrollStart, IdentifyStart, IdentifyStop, OperationCancel, Ping,
        HelloAck, Status, DeviceConnected, DeviceDisconnected, EnrollProgress, EnrollCompleted,
        EnrollFailed, IdentifyCaptured, IdentifySent, IdentifyFailed, OperationCancelled,
        SessionReplaced, Error, Pong,
    };

    public static readonly IReadOnlySet<string> ClientToAgent = new HashSet<string>
    {
        Hello, StatusGet, EnrollStart, IdentifyStart, IdentifyStop, OperationCancel, Ping,
    };

    public static readonly IReadOnlySet<string> AgentToClient = new HashSet<string>
    {
        HelloAck, Status, DeviceConnected, DeviceDisconnected, EnrollProgress, EnrollCompleted,
        EnrollFailed, IdentifyCaptured, IdentifySent, IdentifyFailed, OperationCancelled,
        SessionReplaced, Error, Pong,
    };

    /// <summary>
    /// Tipos que están permitidos sobre ws:// sin TLS (WEBSOCKET_PROTOCOL.md §2, fallback).
    /// Todo lo demás exige TLS_REQUIRED.
    /// </summary>
    public static readonly IReadOnlySet<string> AllowedWithoutTls = new HashSet<string>
    {
        Hello, HelloAck, StatusGet, Status, Ping, Pong, Error,
    };
}
