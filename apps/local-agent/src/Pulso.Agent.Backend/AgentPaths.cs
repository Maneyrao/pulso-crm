namespace Pulso.Agent.Backend;

/// <summary>
/// Ubicaciones por defecto de configuración/logs/secretos. En Windows sigue
/// LOCAL_AGENT_ARCHITECTURE.md §3 (%ProgramData%\Pulso). En otros SO (desarrollo en macOS/Linux)
/// usa un directorio bajo el home del usuario, ya que %ProgramData% no existe.
/// </summary>
public static class AgentPaths
{
    public static string DefaultConfigDirectory()
    {
        var overridePath = System.Environment.GetEnvironmentVariable("PULSO_AGENT_HOME");
        if (!string.IsNullOrWhiteSpace(overridePath))
        {
            return overridePath;
        }

        if (OperatingSystem.IsWindows())
        {
            var programData = System.Environment.GetFolderPath(System.Environment.SpecialFolder.CommonApplicationData);
            return Path.Combine(programData, "Pulso");
        }

        var home = System.Environment.GetFolderPath(System.Environment.SpecialFolder.UserProfile);
        return Path.Combine(home, ".pulso-agent");
    }

    public static string ConfigFilePath(string? directory = null) =>
        Path.Combine(directory ?? DefaultConfigDirectory(), "agent.json");

    public static string LogsDirectory(string? directory = null) =>
        Path.Combine(directory ?? DefaultConfigDirectory(), "logs");

    public static string SecretsDirectory(string? directory = null) =>
        Path.Combine(directory ?? DefaultConfigDirectory(), "secrets");
}
