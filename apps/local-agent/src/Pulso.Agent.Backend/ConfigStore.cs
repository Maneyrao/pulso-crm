using System.Text.Json;

namespace Pulso.Agent.Backend;

/// <summary>Lee/escribe agent.json de forma atómica (write-to-temp + move) y thread-safe.</summary>
public sealed class ConfigStore(string? path = null)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    private readonly string _path = path ?? AgentPaths.ConfigFilePath();
    private readonly SemaphoreSlim _lock = new(1, 1);

    public async Task<AgentConfig> LoadAsync(CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (!File.Exists(_path))
            {
                return new AgentConfig();
            }

            await using var stream = File.OpenRead(_path);
            var config = await JsonSerializer.DeserializeAsync<AgentConfig>(stream, JsonOptions, ct).ConfigureAwait(false);
            return config ?? new AgentConfig();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task SaveAsync(AgentConfig config, CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var directory = Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var tempPath = $"{_path}.tmp";
            await using (var stream = File.Create(tempPath))
            {
                await JsonSerializer.SerializeAsync(stream, config, JsonOptions, ct).ConfigureAwait(false);
            }

            File.Move(tempPath, _path, overwrite: true);
        }
        finally
        {
            _lock.Release();
        }
    }
}
