namespace Pulso.Agent.Protocol;

/// <summary>Códigos de "error.payload.code" (WEBSOCKET_PROTOCOL.md §7).</summary>
public static class ErrorCodes
{
    public const string ProtocolVersionUnsupported = "PROTOCOL_VERSION_UNSUPPORTED";
    public const string UnknownMessageType = "UNKNOWN_MESSAGE_TYPE";
    public const string HelloRequired = "HELLO_REQUIRED";
    public const string TlsRequired = "TLS_REQUIRED";
    public const string AgentNotConfigured = "AGENT_NOT_CONFIGURED";
    public const string AgentPendingApproval = "AGENT_PENDING_APPROVAL";
    public const string AgentDisabled = "AGENT_DISABLED";
    public const string AgentBusy = "AGENT_BUSY";
    public const string NoDevice = "NO_DEVICE";
    public const string DeviceError = "DEVICE_ERROR";
    public const string DeviceDisconnected = "DEVICE_DISCONNECTED";
    public const string QualityTooLow = "QUALITY_TOO_LOW";
    public const string Timeout = "TIMEOUT";
    public const string InvalidToken = "INVALID_TOKEN";
    public const string BackendUnreachable = "BACKEND_UNREACHABLE";
    public const string BackendRejected = "BACKEND_REJECTED";
    public const string InternalError = "INTERNAL_ERROR";

    /// <summary>Código interno de validación: el envelope no trae los campos obligatorios.</summary>
    public const string MalformedEnvelope = "MALFORMED_ENVELOPE";

    /// <summary>Código interno de validación: el payload no cumple el shape esperado para "type".</summary>
    public const string InvalidPayload = "INVALID_PAYLOAD";
}
