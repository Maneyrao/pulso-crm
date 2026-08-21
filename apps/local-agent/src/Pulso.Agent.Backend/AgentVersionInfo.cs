using System.Reflection;

namespace Pulso.Agent.Backend;

public static class AgentVersionInfo
{
    public static string Current { get; } =
        typeof(AgentVersionInfo).Assembly.GetName().Version?.ToString() ?? "0.1.0-dev";
}
