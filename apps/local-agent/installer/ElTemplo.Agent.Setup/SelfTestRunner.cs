using System.Reflection;
using System.Text.Json;

namespace ElTemplo.Agent.Setup;

internal static class SelfTestRunner
{
    public static async Task<int> RunAsync(string? reportPath)
    {
        var resources = Assembly.GetExecutingAssembly().GetManifestResourceNames();
        var checks = new Dictionary<string, bool>
        {
            ["windows"] = OperatingSystem.IsWindowsVersionAtLeast(10),
            ["x64"] = Environment.Is64BitOperatingSystem,
            ["agentPayload"] = resources.Contains("ElTemploAgent.exe", StringComparer.Ordinal),
            ["desktopPayloadExcluded"] = !resources.Contains("ElTemploCRM.exe", StringComparer.Ordinal),
            ["crmUrl"] = Uri.TryCreate(InstallerConstants.CrmUrl, UriKind.Absolute, out var crm) && crm.Scheme == Uri.UriSchemeHttps,
            ["apiUrl"] = Uri.TryCreate(InstallerConstants.CrmApiUrl, UriKind.Absolute, out var api) && api.Scheme == Uri.UriSchemeHttps,
        };
        var report = new
        {
            product = InstallerConstants.ProductName,
            version = Assembly.GetExecutingAssembly().GetName().Version?.ToString(),
            passed = checks.Values.All(value => value),
            checks,
        };
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true });
        if (!string.IsNullOrWhiteSpace(reportPath))
        {
            var fullPath = Path.GetFullPath(reportPath);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
            await File.WriteAllTextAsync(fullPath, json);
        }
        return report.passed ? 0 : 1;
    }
}
