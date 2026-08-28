using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using ElTemplo.Setup.Core;
using Pulso.Agent.Backend;
using Pulso.Agent.Backend.Http;

namespace ElTemplo.Agent.Setup;

internal sealed record AgentLinkState(bool IsPaired, string? AgentId, string? Status);

internal sealed class AgentPairer : IAgentPairer
{
    private readonly ConfigStore _configStore = new();
    private readonly DpapiSecretStore _secretStore = new();

    public async Task<bool> IsPairedAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var credential = await _secretStore.RetrieveAsync(SecretKeys.AgentCredential);
        var config = await _configStore.LoadAsync();
        return !string.IsNullOrWhiteSpace(credential) && !string.IsNullOrWhiteSpace(config.AgentId);
    }

    public async Task PairAsync(
        string installationId,
        string pairingSecret,
        CancellationToken cancellationToken)
    {
        var config = await _configStore.LoadAsync();
        Configure(config);
        await _configStore.SaveAsync(config);

        using var http = new HttpClient
        {
            BaseAddress = new Uri(config.BackendBaseUrl),
            Timeout = TimeSpan.FromSeconds(25),
        };
        var client = new BackendClient(http);
        var paired = await client.PairAsync(new PairRequest
        {
            InstallationId = installationId,
            Secret = pairingSecret,
            MachineFingerprint = MachineFingerprint(),
            AgentVersion = AgentVersionInfo.Current,
            OsVersion = RuntimeInformation.OSDescription,
        }, cancellationToken);

        if (string.IsNullOrWhiteSpace(paired.AgentId))
        {
            throw new InvalidOperationException("El CRM no devolvió la identidad de esta computadora.");
        }
        await _secretStore.StoreAsync(SecretKeys.AgentCredential, paired.AgentCredential);
        config.AgentId = paired.AgentId;
        await _configStore.SaveAsync(config);
    }

    public async Task<AgentLinkState> GetLinkStateAsync(CancellationToken cancellationToken)
    {
        var credential = await _secretStore.RetrieveAsync(SecretKeys.AgentCredential, cancellationToken);
        var config = await _configStore.LoadAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(credential) || string.IsNullOrWhiteSpace(config.AgentId))
        {
            return new AgentLinkState(false, null, null);
        }

        try
        {
            Configure(config);
            using var http = new HttpClient
            {
                BaseAddress = new Uri(config.BackendBaseUrl),
                Timeout = TimeSpan.FromSeconds(15),
            };
            var heartbeat = await new BackendClient(http).HeartbeatAsync(
                credential,
                new HeartbeatRequest
                {
                    AgentState = "ONLINE",
                    AgentVersion = AgentVersionInfo.Current,
                    DeviceStatus = "UNKNOWN",
                },
                cancellationToken);
            return new AgentLinkState(true, config.AgentId, heartbeat.Status);
        }
        catch
        {
            return new AgentLinkState(true, config.AgentId, null);
        }
    }

    public async Task ClearPairingAsync(CancellationToken cancellationToken)
    {
        await _secretStore.DeleteAsync(SecretKeys.AgentCredential, cancellationToken);
        var config = await _configStore.LoadAsync(cancellationToken);
        config.AgentId = null;
        await _configStore.SaveAsync(config, cancellationToken);
    }

    public static async Task EnsureConfigurationAsync()
    {
        var store = new ConfigStore();
        var config = await store.LoadAsync();
        Configure(config);
        await store.SaveAsync(config);
    }

    private static void Configure(AgentConfig config)
    {
        var configDirectory = AgentPaths.DefaultConfigDirectory();
        config.BackendBaseUrl = InstallerConstants.BackendUrl;
        config.AllowedOrigins =
        [
            "https://pulso-crm-omega.vercel.app",
            "https://pulso-crm-maneyraos-projects.vercel.app",
        ];
        config.WsPort = 21987;
        config.SensorKind = "wbf";
        config.TlsEnabled = true;
        config.TlsCertPath = Path.Combine(configDirectory, "localhost.pfx");
        config.TlsCertPassword = string.Empty;
        config.Environment = "production";
    }

    private static string MachineFingerprint()
    {
        var material = $"{Environment.MachineName}|{Environment.UserName}|{RuntimeInformation.OSDescription}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(material))).ToLowerInvariant();
    }
}
