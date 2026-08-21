namespace Pulso.Agent.Backend;

/// <summary>
/// Guarda las credenciales de pareo del agente fuera de agent.json (LOCAL_AGENT_ARCHITECTURE.md §3,
/// BIOMETRIC_SECURITY.md §8.3). Producción: <see cref="DpapiSecretStore"/> (Windows, scope
/// LocalMachine). Desarrollo/tests en cualquier SO: <see cref="FileSecretStore"/>.
/// </summary>
public interface ISecretStore
{
    Task StoreAsync(string key, string secret, CancellationToken ct = default);

    Task<string?> RetrieveAsync(string key, CancellationToken ct = default);

    Task DeleteAsync(string key, CancellationToken ct = default);
}
