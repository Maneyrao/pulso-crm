using System.Text.Json.Serialization;

namespace Pulso.Agent.Backend;

/// <summary>
/// agent.json (LOCAL_AGENT_ARCHITECTURE.md §3-§4). Legible por soporte; nunca contiene secretos —
/// esos van por <see cref="ISecretStore"/>.
/// </summary>
public sealed class AgentConfig
{
    [JsonPropertyName("agentId")]
    public string? AgentId { get; set; }

    [JsonPropertyName("branchId")]
    public string? BranchId { get; set; }

    [JsonPropertyName("gymId")]
    public string? GymId { get; set; }

    [JsonPropertyName("backendBaseUrl")]
    public string BackendBaseUrl { get; set; } = "http://localhost:4001";

    /// <summary>Allowlist de Origin para el upgrade del WS local (§4.1).</summary>
    [JsonPropertyName("allowedOrigins")]
    public List<string> AllowedOrigins { get; set; } = ["http://localhost:4000", "http://localhost:3000"];

    [JsonPropertyName("wsPort")]
    public int WsPort { get; set; } = 21987;

    [JsonPropertyName("tlsEnabled")]
    public bool TlsEnabled { get; set; }

    /// <summary>Ruta al certificado autofirmado instalado por el instalador (§3). Null en dev sin TLS.</summary>
    [JsonPropertyName("tlsCertPath")]
    public string? TlsCertPath { get; set; }

    [JsonPropertyName("tlsCertPassword")]
    public string? TlsCertPassword { get; set; }

    /// <summary>"development" habilita los orígenes localhost de desarrollo y relaja TLS (§4.1).</summary>
    [JsonPropertyName("environment")]
    public string Environment { get; set; } = "development";
}
