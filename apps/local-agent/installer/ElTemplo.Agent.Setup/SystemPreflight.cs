using System.Net;
using System.Security.Principal;
using ElTemplo.Setup.Core;
using Microsoft.Web.WebView2.Core;

namespace ElTemplo.Agent.Setup;

internal sealed record PreflightCheck(string Label, bool Passed, string Detail, bool Blocking);

internal sealed record PreflightResult(IReadOnlyList<PreflightCheck> Checks, ReaderCheck Reader)
{
    public bool CanContinue => Checks.All(check => !check.Blocking || check.Passed);
}

internal static class SystemPreflight
{
    public static async Task<PreflightResult> RunAsync(CancellationToken cancellationToken)
    {
        var checks = new List<PreflightCheck>
        {
            new("Windows compatible", OperatingSystem.IsWindowsVersionAtLeast(10), "Windows 10 u 11 de 64 bits", true),
            new("Sistema de 64 bits", Environment.Is64BitOperatingSystem, "Compatible con El Templo CRM", true),
            new("Permisos de instalación", IsAdministrator(), "Permisos para instalar el lector", true),
        };

        checks.Add(new PreflightCheck(
            "Conexión a Internet",
            await HasInternetAsync(cancellationToken),
            "Acceso al CRM y las actualizaciones",
            true));
        checks.Add(new PreflightCheck(
            "Motor de la aplicación",
            HasWebView2(),
            HasWebView2() ? "WebView2 está disponible" : "Se instalará automáticamente",
            false));

        var reader = await new ReaderProbe().CheckAsync(cancellationToken);
        checks.Add(new PreflightCheck(
            "Lector de huellas",
            reader.Detected,
            reader.Detected ? $"{reader.Manufacturer} {reader.Model}" : "Podés conectarlo durante la instalación",
            false));

        return new PreflightResult(checks, reader);
    }

    private static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static bool HasWebView2()
    {
        try
        {
            return !string.IsNullOrWhiteSpace(CoreWebView2Environment.GetAvailableBrowserVersionString());
        }
        catch
        {
            return false;
        }
    }

    private static async Task<bool> HasInternetAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var handler = new HttpClientHandler { AutomaticDecompression = DecompressionMethods.All };
            using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(12) };
            using var response = await http.GetAsync(InstallerConstants.CrmUrl, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }
}
