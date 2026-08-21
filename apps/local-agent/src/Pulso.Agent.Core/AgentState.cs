namespace Pulso.Agent.Core;

/// <summary>Máquina de estados del agente (LOCAL_AGENT_ARCHITECTURE.md §6).</summary>
public enum AgentState
{
    NotConfigured,
    PendingApproval,
    Ready,
    NoDevice,
    Busy,
    BackendDown,
    Disabled,
}

public sealed class AgentStateChangedEventArgs(AgentState previous, AgentState current, string? reason) : EventArgs
{
    public AgentState Previous { get; } = previous;
    public AgentState Current { get; } = current;
    public string? Reason { get; } = reason;
}
