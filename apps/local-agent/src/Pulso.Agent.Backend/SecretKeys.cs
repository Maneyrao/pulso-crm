namespace Pulso.Agent.Backend;

/// <summary>Claves usadas contra <see cref="ISecretStore"/>.</summary>
public static class SecretKeys
{
    /// <summary>Credencial que devuelve POST /agent/pair. Bearer para heartbeat/events.</summary>
    public const string AgentCredential = "agentCredential";
}
