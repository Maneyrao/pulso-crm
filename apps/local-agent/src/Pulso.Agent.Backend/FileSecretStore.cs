using System.Text;

namespace Pulso.Agent.Backend;

/// <summary>
/// Implementación de desarrollo/tests de <see cref="ISecretStore"/>: guarda cada secreto como un
/// archivo separado bajo <c>secrets/</c>, en Base64 (ofuscación, NO cifrado). Nunca usar en
/// producción — ahí corresponde <see cref="DpapiSecretStore"/> en Windows. Sirve para desarrollar
/// y correr tests en macOS/Linux donde DPAPI no existe.
/// </summary>
public sealed class FileSecretStore(string? directory = null) : ISecretStore
{
    private readonly string _directory = directory ?? AgentPaths.SecretsDirectory();

    public async Task StoreAsync(string key, string secret, CancellationToken ct = default)
    {
        Directory.CreateDirectory(_directory);
        var path = PathFor(key);
        var encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes(secret));
        await File.WriteAllTextAsync(path, encoded, ct).ConfigureAwait(false);
    }

    public async Task<string?> RetrieveAsync(string key, CancellationToken ct = default)
    {
        var path = PathFor(key);
        if (!File.Exists(path))
        {
            return null;
        }

        var encoded = await File.ReadAllTextAsync(path, ct).ConfigureAwait(false);
        return Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
    }

    public Task DeleteAsync(string key, CancellationToken ct = default)
    {
        var path = PathFor(key);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    private string PathFor(string key)
    {
        var safeKey = Uri.EscapeDataString(key);
        return Path.Combine(_directory, $"{safeKey}.secret");
    }
}
