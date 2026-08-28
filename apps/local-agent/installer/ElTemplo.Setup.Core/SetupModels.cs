namespace ElTemplo.Setup.Core;

public enum SetupStage
{
    PreparingFiles,
    ProvisioningAgent,
    PairingAgent,
    ApprovingAgent,
    InstallingService,
    DetectingReader,
    CreatingShortcuts,
    Completed,
}

public sealed record SetupRequest(string? BranchId, string AgentName);

public sealed record SetupProgress(SetupStage Stage, int Percent, string Message);

public sealed record ProvisionedAgent(
    string AgentId,
    string InstallationId,
    string PairingSecret);

public sealed record ReaderCheck(
    bool Detected,
    string? Manufacturer,
    string? Model,
    string UserMessage)
{
    public static ReaderCheck Found(string manufacturer, string model) =>
        new(true, manufacturer, model, $"{manufacturer} {model} está listo.");

    public static ReaderCheck NotDetected(string userMessage) =>
        new(false, null, null, userMessage);
}

public sealed record SetupResult(bool WasRepair, ReaderCheck Reader);

public sealed record CrmBranch(string Id, string Name);

public sealed record CrmSession(
    string Email,
    string GymName,
    IReadOnlyList<CrmBranch> Branches,
    string? ActiveBranchId);

public sealed class CrmProvisioningException : Exception
{
    public CrmProvisioningException(string code, string userMessage)
        : base(userMessage) => Code = code;

    public string Code { get; }
}

public sealed class SetupFailureException : Exception
{
    public SetupFailureException(
        SetupStage stage,
        string diagnosticCode,
        string userMessage,
        string diagnosticType)
        : base(userMessage)
    {
        Stage = stage;
        DiagnosticCode = diagnosticCode;
        DiagnosticType = diagnosticType;
    }

    public SetupStage Stage { get; }

    public string DiagnosticCode { get; }

    public string DiagnosticType { get; }
}
