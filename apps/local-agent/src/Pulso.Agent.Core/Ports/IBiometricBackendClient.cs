namespace Pulso.Agent.Core.Ports;

/// <summary>
/// Puerto hacia la superficie de biometría del backend (API_CONTRACTS.md §10). Implementado por
/// Pulso.Agent.Backend.BackendClient sobre HTTPS con Bearer deviceToken; OperationCoordinator sólo
/// conoce esta interfaz. Cada deviceToken es de un solo uso y va atado a la operación que lo pidió.
/// </summary>
public interface IBiometricBackendClient
{
    /// <summary>POST /agent/biometrics/enroll-complete. Lanza <see cref="BackendRejectedException"/>
    /// o <see cref="BackendUnreachableException"/> ante error.</summary>
    Task<EnrollCompleteResult> CompleteEnrollAsync(string deviceToken, EnrollCompleteRequest request, CancellationToken ct);

    /// <summary>POST /agent/biometrics/identify. Nunca devuelve datos del socio.</summary>
    Task<IdentifyResult> SubmitIdentifyAsync(string deviceToken, IdentifyRequest request, CancellationToken ct);
}

/// <summary>El backend rechazó la request (401/403/422/429) con un código de protocolo mapeable.</summary>
public sealed class BackendRejectedException(string code, string detail) : Exception(detail)
{
    public string Code { get; } = code;
}

/// <summary>No se pudo alcanzar al backend (red, timeout, 5xx tras reintentos).</summary>
public sealed class BackendUnreachableException(string detail) : Exception(detail);
