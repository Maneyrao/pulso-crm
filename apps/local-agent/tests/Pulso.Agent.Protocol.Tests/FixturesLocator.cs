namespace Pulso.Agent.Protocol.Tests;

/// <summary>
/// Encuentra docs/biometrics/protocol-fixtures/ subiendo desde el directorio de salida del test.
/// Las fixtures viven fuera de apps/local-agent porque son compartidas con el frontend TS
/// (WEBSOCKET_PROTOCOL.md §11 / LOCAL_AGENT_ARCHITECTURE.md §12).
/// </summary>
public static class FixturesLocator
{
    public static string Directory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "docs", "biometrics", "protocol-fixtures");
            if (System.IO.Directory.Exists(candidate))
            {
                return candidate;
            }

            dir = dir.Parent;
        }

        throw new DirectoryNotFoundException(
            $"No se encontró docs/biometrics/protocol-fixtures subiendo desde {AppContext.BaseDirectory}");
    }
}
