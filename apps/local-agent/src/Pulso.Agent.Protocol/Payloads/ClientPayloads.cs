using System.Text.Json.Serialization;

namespace Pulso.Agent.Protocol.Payloads;

/// <summary>Payloads de mensajes Cliente -> Agente (WEBSOCKET_PROTOCOL.md §6.1).</summary>

public sealed record HelloPayload
{
    [JsonPropertyName("clientVersion")]
    public required string ClientVersion { get; init; }

    [JsonPropertyName("gymId")]
    public string? GymId { get; init; }

    [JsonPropertyName("branchId")]
    public string? BranchId { get; init; }

    [JsonPropertyName("userAgent")]
    public string? UserAgent { get; init; }
}

public sealed record EnrollStartPayload
{
    [JsonPropertyName("opId")]
    public required string OpId { get; init; }

    [JsonPropertyName("enrollmentId")]
    public required string EnrollmentId { get; init; }

    [JsonPropertyName("deviceToken")]
    public required string DeviceToken { get; init; }

    [JsonPropertyName("deviceId")]
    public required string DeviceId { get; init; }

    [JsonPropertyName("samplesRequired")]
    public required int SamplesRequired { get; init; }

    [JsonPropertyName("minQuality")]
    public required int MinQuality { get; init; }

    [JsonPropertyName("fingerPosition")]
    public string? FingerPosition { get; init; }

    [JsonPropertyName("timeoutMs")]
    public int? TimeoutMs { get; init; }
}

public sealed record IdentifyStartPayload
{
    [JsonPropertyName("opId")]
    public required string OpId { get; init; }

    [JsonPropertyName("deviceToken")]
    public required string DeviceToken { get; init; }

    [JsonPropertyName("deviceId")]
    public required string DeviceId { get; init; }

    [JsonPropertyName("branchId")]
    public required string BranchId { get; init; }

    [JsonPropertyName("minQuality")]
    public int? MinQuality { get; init; }

    [JsonPropertyName("continuous")]
    public bool? Continuous { get; init; }

    [JsonPropertyName("idleTimeoutMs")]
    public int? IdleTimeoutMs { get; init; }
}

public sealed record IdentifyStopPayload
{
    [JsonPropertyName("opId")]
    public required string OpId { get; init; }
}

public sealed record OperationCancelPayload
{
    [JsonPropertyName("opId")]
    public required string OpId { get; init; }

    [JsonPropertyName("reason")]
    public string? Reason { get; init; }
}
