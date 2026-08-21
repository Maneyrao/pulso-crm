using System.Text.Json.Serialization;

namespace Pulso.Agent.Protocol.Payloads;

/// <summary>Payloads de mensajes Agente -> Cliente (WEBSOCKET_PROTOCOL.md §6.2).</summary>

public sealed record HelloAckPayload
{
    [JsonPropertyName("protocolVersion")]
    public required string ProtocolVersion { get; init; }

    [JsonPropertyName("agentVersion")]
    public required string AgentVersion { get; init; }

    [JsonPropertyName("agentState")]
    public required string AgentState { get; init; }

    [JsonPropertyName("tls")]
    public required bool Tls { get; init; }

    [JsonPropertyName("devices")]
    public required IReadOnlyList<DeviceInfo> Devices { get; init; }

    [JsonPropertyName("reason")]
    public string? Reason { get; init; }
}

/// <summary>status usa exactamente el mismo shape que hello.ack (§6.2).</summary>
public sealed record StatusPayload
{
    [JsonPropertyName("protocolVersion")]
    public required string ProtocolVersion { get; init; }

    [JsonPropertyName("agentVersion")]
    public required string AgentVersion { get; init; }

    [JsonPropertyName("agentState")]
    public required string AgentState { get; init; }

    [JsonPropertyName("tls")]
    public required bool Tls { get; init; }

    [JsonPropertyName("devices")]
    public required IReadOnlyList<DeviceInfo> Devices { get; init; }

    [JsonPropertyName("reason")]
    public string? Reason { get; init; }
}

public sealed record DeviceConnectedPayload
{
    [JsonPropertyName("deviceId")]
    public required string DeviceId { get; init; }

    [JsonPropertyName("kind")]
    public string? Kind { get; init; }

    [JsonPropertyName("vendor")]
    public string? Vendor { get; init; }

    [JsonPropertyName("model")]
    public string? Model { get; init; }

    [JsonPropertyName("serialNumber")]
    public string? SerialNumber { get; init; }

    [JsonPropertyName("status")]
    public required string Status { get; init; }
}

public sealed record DeviceDisconnectedPayload
{
    [JsonPropertyName("deviceId")]
    public required string DeviceId { get; init; }

    [JsonPropertyName("reason")]
    public required string Reason { get; init; }
}

public sealed record EnrollProgressPayload
{
    [JsonPropertyName("opId")]
    public required string OpId { get; init; }

    [JsonPropertyName("captured")]
    public required int Captured { get; init; }

    [JsonPropertyName("required")]
    public required int Required { get; init; }

    [JsonPropertyName("lastQuality")]
    public int? LastQuality { get; init; }

    [JsonPropertyName("prompt")]
    public string? Prompt { get; init; }

    [JsonPropertyName("warning")]
    public string? Warning { get; init; }
}

public sealed record EnrollCompletedPayload
{
    [JsonPropertyName("opId")]
    public required string OpId { get; init; }

    [JsonPropertyName("enrollmentId")]
    public required string EnrollmentId { get; init; }

    [JsonPropertyName("finalQuality")]
    public required int FinalQuality { get; init; }
}

public sealed record EnrollFailedPayload
{
    [JsonPropertyName("opId")]
    public required string OpId { get; init; }

    [JsonPropertyName("code")]
    public required string Code { get; init; }

    [JsonPropertyName("detail")]
    public string? Detail { get; init; }
}

public sealed record IdentifyCapturedPayload
{
    [JsonPropertyName("opId")]
    public required string OpId { get; init; }

    [JsonPropertyName("quality")]
    public required int Quality { get; init; }
}

public sealed record IdentifySentPayload
{
    [JsonPropertyName("opId")]
    public required string OpId { get; init; }
}

public sealed record IdentifyFailedPayload
{
    [JsonPropertyName("opId")]
    public required string OpId { get; init; }

    [JsonPropertyName("code")]
    public required string Code { get; init; }
}

public sealed record OperationCancelledPayload
{
    [JsonPropertyName("opId")]
    public required string OpId { get; init; }

    [JsonPropertyName("reason")]
    public string? Reason { get; init; }
}

public sealed record SessionReplacedPayload
{
    [JsonPropertyName("reason")]
    public required string Reason { get; init; }
}

public sealed record ErrorPayload
{
    [JsonPropertyName("code")]
    public required string Code { get; init; }

    [JsonPropertyName("detail")]
    public string? Detail { get; init; }

    [JsonPropertyName("opId")]
    public string? OpId { get; init; }
}
