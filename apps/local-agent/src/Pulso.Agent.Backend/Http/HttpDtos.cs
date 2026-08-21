using System.Text.Json.Serialization;

namespace Pulso.Agent.Backend.Http;

/// <summary>DTOs de la superficie agente del backend (API_CONTRACTS.md §10).</summary>

public sealed record PairRequest
{
    [JsonPropertyName("installationId")]
    public required string InstallationId { get; init; }

    [JsonPropertyName("secret")]
    public required string Secret { get; init; }

    [JsonPropertyName("machineFingerprint")]
    public required string MachineFingerprint { get; init; }

    [JsonPropertyName("agentVersion")]
    public required string AgentVersion { get; init; }

    [JsonPropertyName("osVersion")]
    public required string OsVersion { get; init; }
}

public sealed record PairResponse
{
    [JsonPropertyName("agentCredential")]
    public required string AgentCredential { get; init; }

    [JsonPropertyName("agentId")]
    public string? AgentId { get; init; }
}

public sealed record HeartbeatRequest
{
    [JsonPropertyName("agentState")]
    public required string AgentState { get; init; }

    [JsonPropertyName("agentVersion")]
    public required string AgentVersion { get; init; }

    [JsonPropertyName("deviceStatus")]
    public string? DeviceStatus { get; init; }
}

public sealed record HeartbeatResponse
{
    /// <summary>PENDING_APPROVAL | ACTIVE | REVOKED | BLOCKED (§5.1).</summary>
    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("reason")]
    public string? Reason { get; init; }
}

public sealed record AgentAuditEventDto
{
    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("severity")]
    public required string Severity { get; init; }

    [JsonPropertyName("message")]
    public required string Message { get; init; }

    [JsonPropertyName("metadata")]
    public IReadOnlyDictionary<string, string>? Metadata { get; init; }

    [JsonPropertyName("occurredAt")]
    public required DateTimeOffset OccurredAt { get; init; }
}

public sealed record SendEventsRequest
{
    [JsonPropertyName("events")]
    public required IReadOnlyList<AgentAuditEventDto> Events { get; init; }
}

public sealed record EnrollCompleteHttpRequest
{
    [JsonPropertyName("enrollmentId")]
    public required string EnrollmentId { get; init; }

    [JsonPropertyName("template")]
    public required string Template { get; init; }

    [JsonPropertyName("templateFormat")]
    public required string TemplateFormat { get; init; }

    [JsonPropertyName("quality")]
    public required int Quality { get; init; }
}

public sealed record EnrollCompleteHttpResponse
{
    [JsonPropertyName("ok")]
    public required bool Ok { get; init; }
}

public sealed record IdentifyHttpRequest
{
    [JsonPropertyName("branchId")]
    public required string BranchId { get; init; }

    [JsonPropertyName("deviceId")]
    public required string DeviceId { get; init; }

    [JsonPropertyName("template")]
    public required string Template { get; init; }

    [JsonPropertyName("templateFormat")]
    public required string TemplateFormat { get; init; }

    [JsonPropertyName("quality")]
    public required int Quality { get; init; }

    [JsonPropertyName("capturedAt")]
    public required DateTimeOffset CapturedAt { get; init; }
}

public sealed record IdentifyHttpResponse
{
    [JsonPropertyName("resolved")]
    public required bool Resolved { get; init; }
}
