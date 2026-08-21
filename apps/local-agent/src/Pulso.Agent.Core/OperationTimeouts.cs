using Pulso.Agent.Protocol;

namespace Pulso.Agent.Core;

/// <summary>
/// Timeouts de OperationCoordinator (LOCAL_AGENT_ARCHITECTURE.md §7). Los valores por defecto son
/// los documentados; se puede inyectar otros en tests para no esperar 20s/120s/300s reales.
/// </summary>
public sealed record OperationTimeouts
{
    public TimeSpan Capture { get; init; } = ProtocolConstants.CaptureTimeout;
    public TimeSpan EnrollSession { get; init; } = ProtocolConstants.EnrollSessionTimeout;
    public TimeSpan IdentifyIdle { get; init; } = ProtocolConstants.IdentifyIdleTimeout;

    /// <summary>
    /// Cuánto espera un start nuevo a que termine el teardown de una operación ya cancelada antes
    /// de responder AGENT_BUSY (ver SessionManager.BeginAsync). No está en la tabla de §7: es una
    /// tolerancia interna a la carrera stop→start, no un timeout del protocolo.
    /// </summary>
    public TimeSpan TeardownGrace { get; init; } = TimeSpan.FromSeconds(5);
}
