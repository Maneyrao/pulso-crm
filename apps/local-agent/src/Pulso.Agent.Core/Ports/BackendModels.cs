using Pulso.Agent.Sensors;

namespace Pulso.Agent.Core.Ports;

/// <summary>
/// Modelos de la superficie HTTP agente-backend usados por Core (API_CONTRACTS.md §10). Viven en
/// Core porque OperationCoordinator los produce/consume; Pulso.Agent.Backend los serializa a HTTP.
/// </summary>
public sealed record EnrollCompleteRequest
{
    public required string EnrollmentId { get; init; }
    public required byte[] Template { get; init; }
    public required TemplateFormat Format { get; init; }
    public required int Quality { get; init; }
}

public sealed record EnrollCompleteResult
{
    public required bool Ok { get; init; }
}

public sealed record IdentifyRequest
{
    public required string BranchId { get; init; }
    public required string DeviceId { get; init; }
    public required byte[] Template { get; init; }
    public required TemplateFormat Format { get; init; }
    public required int Quality { get; init; }
    public required DateTimeOffset CapturedAt { get; init; }
}

/// <summary>El agente sólo recibe { resolved: true } — nunca identidad (API_CONTRACTS.md §10).</summary>
public sealed record IdentifyResult
{
    public required bool Resolved { get; init; }
}
