using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;

namespace Pulso.Agent.Backend;

/// <summary>
/// Implementación de producción de <see cref="ISecretStore"/>: Windows DPAPI, scope
/// <see cref="DataProtectionScope.LocalMachine"/> (BIOMETRIC_SECURITY.md §8.3). El ciphertext
/// queda atado a la máquina; copiar la carpeta a otra PC no permite descifrar (de ahí que un
/// agente copiado vuelva a PENDING_APPROVAL vía machineFingerprint).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class DpapiSecretStore(string? directory = null) : ISecretStore
{
    private readonly string _directory = directory ?? AgentPaths.SecretsDirectory();

    public Task StoreAsync(string key, string secret, CancellationToken ct = default)
    {
        RequireWindows();
        Directory.CreateDirectory(_directory);
        var plainBytes = Encoding.UTF8.GetBytes(secret);
        var protectedBytes = ProtectedData.Protect(plainBytes, optionalEntropy: null, DataProtectionScope.LocalMachine);
        return File.WriteAllBytesAsync(PathFor(key), protectedBytes, ct);
    }

    public async Task<string?> RetrieveAsync(string key, CancellationToken ct = default)
    {
        RequireWindows();
        var path = PathFor(key);
        if (!File.Exists(path))
        {
            return null;
        }

        var protectedBytes = await File.ReadAllBytesAsync(path, ct).ConfigureAwait(false);
        var plainBytes = ProtectedData.Unprotect(protectedBytes, optionalEntropy: null, DataProtectionScope.LocalMachine);
        return Encoding.UTF8.GetString(plainBytes);
    }

    public Task DeleteAsync(string key, CancellationToken ct = default)
    {
        RequireWindows();
        var path = PathFor(key);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    private static void RequireWindows()
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException(
                "DpapiSecretStore requiere Windows DPAPI. Usá FileSecretStore para desarrollo/tests " +
                $"en este entorno ({System.Environment.OSVersion.Platform}).");
        }
    }

    private string PathFor(string key)
    {
        var safeKey = Uri.EscapeDataString(key);
        return Path.Combine(_directory, $"{safeKey}.dpapi");
    }
}
