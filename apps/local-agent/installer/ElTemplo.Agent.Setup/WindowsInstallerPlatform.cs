using System.Diagnostics;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using ElTemplo.Setup.Core;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Pulso.Agent.Backend;

namespace ElTemplo.Agent.Setup;

internal sealed class WindowsInstallerPlatform(InstallLogger logger) : IInstallerPlatform
{
    public async Task InstallPayloadsAsync(CancellationToken cancellationToken)
    {
        RequireWindows();
        logger.Info("PAYLOAD_INSTALL_STARTED");
        await StopServiceIfPresentAsync(cancellationToken);

        Directory.CreateDirectory(InstallerConstants.AgentDirectory);
        Directory.CreateDirectory(InstallerConstants.DesktopDirectory);
        Directory.CreateDirectory(InstallerConstants.InstallerDirectory);
        Directory.CreateDirectory(AgentPaths.DefaultConfigDirectory());

        await ExtractResourceAsync("ElTemploAgent.exe", InstallerConstants.AgentExecutable, cancellationToken);
        await ExtractResourceAsync("ElTemploCRM.exe", InstallerConstants.DesktopExecutable, cancellationToken);
        CopyInstallerForRepair();
        EnsureLocalCertificate();
        await AgentPairer.EnsureConfigurationAsync();
        RestrictConfigDirectory();
        await EnsureWebViewRuntimeAsync(cancellationToken);
        RegisterUninstaller();
        logger.Info("PAYLOAD_INSTALL_COMPLETED");
    }

    public async Task InstallServiceAsync(CancellationToken cancellationToken)
    {
        logger.Info("SERVICE_INSTALL_STARTED");
        var exists = await RunProcessAsync("sc.exe", ["query", InstallerConstants.ServiceName], false, cancellationToken) == 0;
        if (exists)
        {
            await RunProcessAsync(
                "sc.exe",
                ["config", InstallerConstants.ServiceName, "binPath=", $"\"{InstallerConstants.AgentExecutable}\"", "start=", "auto", "obj=", "LocalSystem"],
                true,
                cancellationToken);
        }
        else
        {
            await RunProcessAsync(
                "sc.exe",
                ["create", InstallerConstants.ServiceName, "binPath=", $"\"{InstallerConstants.AgentExecutable}\"", "start=", "auto", "obj=", "LocalSystem", "DisplayName=", "El Templo Agent"],
                true,
                cancellationToken);
        }

        await RunProcessAsync(
            "sc.exe",
            ["description", InstallerConstants.ServiceName, "Conecta el lector HID U.are.U 4500 con El Templo CRM."],
            false,
            cancellationToken);
        await RunProcessAsync(
            "sc.exe",
            ["failure", InstallerConstants.ServiceName, "reset=", "86400", "actions=", "restart/5000/restart/15000/restart/60000"],
            false,
            cancellationToken);
        await RunProcessAsync("sc.exe", ["start", InstallerConstants.ServiceName], true, cancellationToken);
        logger.Info("SERVICE_INSTALL_COMPLETED");
    }

    public async Task CreateShortcutsAsync(CancellationToken cancellationToken)
    {
        logger.Info("SHORTCUTS_STARTED");
        var commonDesktop = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
        var commonPrograms = Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms);
        var startMenuDirectory = Path.Combine(commonPrograms, "El Templo CRM");
        Directory.CreateDirectory(startMenuDirectory);

        await CreateShortcutAsync(
            Path.Combine(commonDesktop, "El Templo CRM.lnk"),
            InstallerConstants.DesktopExecutable,
            InstallerConstants.DesktopDirectory,
            cancellationToken);
        await CreateShortcutAsync(
            Path.Combine(startMenuDirectory, "El Templo CRM.lnk"),
            InstallerConstants.DesktopExecutable,
            InstallerConstants.DesktopDirectory,
            cancellationToken);
        await CreateShortcutAsync(
            Path.Combine(startMenuDirectory, "Reparar o desinstalar.lnk"),
            InstallerConstants.InstalledSetupExecutable,
            InstallerConstants.InstallerDirectory,
            cancellationToken);
        logger.Info("SHORTCUTS_COMPLETED");
    }

    public static void LaunchDesktop()
    {
        Process.Start(new ProcessStartInfo(InstallerConstants.DesktopExecutable) { UseShellExecute = true });
    }

    public static async Task UninstallAsync(CancellationToken cancellationToken)
    {
        await StopServiceIfPresentAsync(cancellationToken);
        await RunProcessAsync("sc.exe", ["delete", InstallerConstants.ServiceName], false, cancellationToken);
        RemoveCertificate();

        DeleteIfPresent(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
            "El Templo CRM.lnk"));
        var menuDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms),
            "El Templo CRM");
        if (Directory.Exists(menuDirectory)) Directory.Delete(menuDirectory, recursive: true);

        using (var uninstall = Registry.LocalMachine.OpenSubKey(
                   @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                   writable: true))
        {
            uninstall?.DeleteSubKeyTree("ElTemploCRM", throwOnMissingSubKey: false);
        }

        var configDirectory = AgentPaths.DefaultConfigDirectory();
        if (Directory.Exists(configDirectory)) Directory.Delete(configDirectory, recursive: true);
        DeleteDirectoryIfPresent(InstallerConstants.AgentDirectory);
        DeleteDirectoryIfPresent(InstallerConstants.DesktopDirectory);

        var self = InstallerConstants.InstalledSetupExecutable;
        if (File.Exists(self))
        {
            var command = $"/c timeout /t 2 /nobreak >nul & rmdir /s /q \"{InstallerConstants.ProductDirectory}\"";
            Process.Start(new ProcessStartInfo("cmd.exe", command)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            });
        }
    }

    private static void RequireWindows()
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10) || !Environment.Is64BitOperatingSystem)
        {
            throw new PlatformNotSupportedException("El Templo CRM requiere Windows 10 u 11 de 64 bits.");
        }
    }

    private static async Task ExtractResourceAsync(
        string resourceName,
        string destinationPath,
        CancellationToken cancellationToken)
    {
        await using var payload = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Falta el componente {resourceName} dentro del instalador.");
        await using var destination = new FileStream(
            destinationPath,
            FileMode.Create,
            FileAccess.Write,
            FileShare.None,
            bufferSize: 81920,
            useAsync: true);
        await payload.CopyToAsync(destination, cancellationToken);
    }

    private static void CopyInstallerForRepair()
    {
        var current = Environment.ProcessPath
            ?? throw new InvalidOperationException("No pudimos localizar el instalador actual.");
        if (!string.Equals(current, InstallerConstants.InstalledSetupExecutable, StringComparison.OrdinalIgnoreCase))
        {
            File.Copy(current, InstallerConstants.InstalledSetupExecutable, overwrite: true);
        }
    }

    private static void EnsureLocalCertificate()
    {
        var certificatePath = Path.Combine(AgentPaths.DefaultConfigDirectory(), "localhost.pfx");
        if (!File.Exists(certificatePath))
        {
            using var rsa = RSA.Create(2048);
            var request = new CertificateRequest(
                "CN=El Templo Agent Local",
                rsa,
                HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1);
            request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
            request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, true));
            request.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(request.PublicKey, false));
            var san = new SubjectAlternativeNameBuilder();
            san.AddDnsName("localhost");
            san.AddIpAddress(IPAddress.Loopback);
            request.CertificateExtensions.Add(san.Build());

            using var created = request.CreateSelfSigned(
                DateTimeOffset.UtcNow.AddDays(-1),
                DateTimeOffset.UtcNow.AddYears(5));
            File.WriteAllBytes(certificatePath, created.Export(X509ContentType.Pfx, string.Empty));
        }

        using var certificate = new X509Certificate2(File.ReadAllBytes(certificatePath));
        using var trustedRoot = new X509Store(StoreName.Root, StoreLocation.LocalMachine);
        trustedRoot.Open(OpenFlags.ReadWrite);
        if (!trustedRoot.Certificates.Any(existing => existing.Thumbprint == certificate.Thumbprint))
        {
            trustedRoot.Add(new X509Certificate2(certificate.Export(X509ContentType.Cert)));
        }
    }

    private static void RemoveCertificate()
    {
        var certificatePath = Path.Combine(AgentPaths.DefaultConfigDirectory(), "localhost.pfx");
        if (!File.Exists(certificatePath)) return;
        try
        {
            using var certificate = new X509Certificate2(File.ReadAllBytes(certificatePath));
            using var trustedRoot = new X509Store(StoreName.Root, StoreLocation.LocalMachine);
            trustedRoot.Open(OpenFlags.ReadWrite);
            foreach (var match in trustedRoot.Certificates.Find(
                         X509FindType.FindByThumbprint,
                         certificate.Thumbprint,
                         validOnly: false))
            {
                trustedRoot.Remove(match);
            }
        }
        catch
        {
            // Uninstall continues even if a damaged certificate cannot be removed.
        }
    }

    private static void RestrictConfigDirectory()
    {
        RunProcessAsync(
                "icacls.exe",
                [AgentPaths.DefaultConfigDirectory(), "/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F"],
                false,
                CancellationToken.None)
            .GetAwaiter()
            .GetResult();
    }

    private static async Task EnsureWebViewRuntimeAsync(CancellationToken cancellationToken)
    {
        if (HasWebView2()) return;
        var bootstrapper = Path.Combine(Path.GetTempPath(), "ElTemplo-WebView2Setup.exe");
        using (var http = new HttpClient { Timeout = TimeSpan.FromMinutes(3) })
        await using (var file = new FileStream(bootstrapper, FileMode.Create, FileAccess.Write, FileShare.None))
        await using (var responseStream = await http.GetStreamAsync(
                         InstallerConstants.WebViewBootstrapperUrl,
                         cancellationToken))
        {
            await responseStream.CopyToAsync(file, cancellationToken);
        }

        try
        {
            await RunProcessAsync(bootstrapper, ["/silent", "/install"], true, cancellationToken);
        }
        finally
        {
            DeleteIfPresent(bootstrapper);
        }

        if (!HasWebView2())
        {
            throw new InvalidOperationException("Microsoft WebView2 no quedó disponible después de instalarlo.");
        }
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

    private static async Task CreateShortcutAsync(
        string shortcutPath,
        string targetPath,
        string workingDirectory,
        CancellationToken cancellationToken)
    {
        var escapedShortcut = shortcutPath.Replace("'", "''");
        var escapedTarget = targetPath.Replace("'", "''");
        var escapedWorkingDirectory = workingDirectory.Replace("'", "''");
        var script = "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('" + escapedShortcut + "');" +
                     "$s.TargetPath='" + escapedTarget + "';" +
                     "$s.WorkingDirectory='" + escapedWorkingDirectory + "';" +
                     "$s.IconLocation='" + escapedTarget + ",0';$s.Save()";
        await RunProcessAsync(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
            true,
            cancellationToken);
    }

    private static void RegisterUninstaller()
    {
        using var key = Registry.LocalMachine.CreateSubKey(
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ElTemploCRM",
            writable: true);
        key.SetValue("DisplayName", InstallerConstants.ProductName);
        key.SetValue("DisplayVersion", "0.2.0");
        key.SetValue("Publisher", "El Templo");
        key.SetValue("InstallLocation", InstallerConstants.ProductDirectory);
        key.SetValue("DisplayIcon", InstallerConstants.DesktopExecutable);
        key.SetValue("UninstallString", $"\"{InstallerConstants.InstalledSetupExecutable}\" --uninstall");
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 0, RegistryValueKind.DWord);
    }

    private static async Task StopServiceIfPresentAsync(CancellationToken cancellationToken)
    {
        if (await RunProcessAsync("sc.exe", ["query", InstallerConstants.ServiceName], false, cancellationToken) != 0) return;
        await RunProcessAsync("sc.exe", ["stop", InstallerConstants.ServiceName], false, cancellationToken);
        await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
    }

    private static async Task<int> RunProcessAsync(
        string fileName,
        IReadOnlyList<string> arguments,
        bool throwOnError,
        CancellationToken cancellationToken)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = fileName,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            },
        };
        foreach (var argument in arguments) process.StartInfo.ArgumentList.Add(argument);
        process.Start();
        await process.WaitForExitAsync(cancellationToken);
        if (throwOnError && process.ExitCode != 0)
        {
            throw new InvalidOperationException($"{Path.GetFileName(fileName)} terminó con código {process.ExitCode}.");
        }
        return process.ExitCode;
    }

    private static void DeleteIfPresent(string path)
    {
        if (File.Exists(path)) File.Delete(path);
    }

    private static void DeleteDirectoryIfPresent(string path)
    {
        if (Directory.Exists(path)) Directory.Delete(path, recursive: true);
    }
}
