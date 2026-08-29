using System.Diagnostics;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using ElTemplo.Setup.Core;
using Microsoft.Win32;
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
        Directory.CreateDirectory(InstallerConstants.InstallerDirectory);
        Directory.CreateDirectory(AgentPaths.DefaultConfigDirectory());
        logger.Info("INSTALL_DIRECTORIES_READY");

        await ExtractResourceAsync("ElTemploAgent.exe", InstallerConstants.AgentExecutable, cancellationToken);
        logger.Info("AGENT_PAYLOAD_READY");
        await CopyInstallerForRepairAsync(cancellationToken);
        logger.Info("REPAIR_PAYLOAD_READY");
        logger.Info(TryRemoveLegacyDesktopPayload()
            ? "LEGACY_DESKTOP_REMOVED"
            : "LEGACY_DESKTOP_CLEANUP_DEFERRED");
        EnsureLocalCertificate();
        logger.Info("LOCAL_CERTIFICATE_READY");
        await AgentPairer.EnsureConfigurationAsync();
        RestrictConfigDirectory();
        logger.Info("AGENT_CONFIGURATION_READY");
        RegisterUninstaller();
        logger.Info("PAYLOAD_INSTALL_COMPLETED");
    }

    public async Task InstallServiceAsync(CancellationToken cancellationToken)
    {
        logger.Info("INTERACTIVE_CONNECTOR_INSTALL_STARTED");
        await StopServiceIfPresentAsync(cancellationToken);
        await RunProcessAsync("sc.exe", ["delete", InstallerConstants.ServiceName], false, cancellationToken);

        var user = WindowsIdentity.GetCurrent().Name;
        if (string.IsNullOrWhiteSpace(user))
        {
            throw new InvalidOperationException("No pudimos identificar al usuario de Windows para iniciar el conector.");
        }

        await RunProcessAsync(
            "schtasks.exe",
            [
                "/Create", "/TN", InstallerConstants.InteractiveTaskName,
                "/TR", $"\"{InstallerConstants.AgentExecutable}\"",
                "/SC", "ONLOGON", "/RU", user, "/RL", "HIGHEST", "/IT", "/F",
            ],
            true,
            cancellationToken);
        await RunProcessAsync(
            "schtasks.exe",
            ["/Run", "/TN", InstallerConstants.InteractiveTaskName],
            true,
            cancellationToken);
        logger.Info("INTERACTIVE_CONNECTOR_INSTALL_COMPLETED");
    }

    public async Task CreateShortcutsAsync(CancellationToken cancellationToken)
    {
        logger.Info("SHORTCUTS_STARTED");
        var commonDesktop = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
        var commonPrograms = Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms);
        var startMenuDirectory = Path.Combine(commonPrograms, "El Templo Huella");
        Directory.CreateDirectory(startMenuDirectory);

        DeleteIfPresent(Path.Combine(commonDesktop, "El Templo CRM.lnk"));
        DeleteDirectoryIfPresent(Path.Combine(commonPrograms, "El Templo CRM"));
        await CreateInternetShortcutAsync(Path.Combine(commonDesktop, "El Templo CRM.url"), cancellationToken);
        await CreateInternetShortcutAsync(Path.Combine(startMenuDirectory, "Abrir El Templo CRM.url"), cancellationToken);
        await CreateShortcutAsync(
            Path.Combine(startMenuDirectory, "Reparar o desinstalar.lnk"),
            InstallerConstants.InstalledSetupExecutable,
            InstallerConstants.InstallerDirectory,
            cancellationToken);
        logger.Info("SHORTCUTS_COMPLETED");
    }

    public static void LaunchWebCrm()
    {
        Process.Start(new ProcessStartInfo(InstallerConstants.CrmUrl) { UseShellExecute = true });
    }

    public static async Task UninstallAsync(CancellationToken cancellationToken)
    {
        await StopServiceIfPresentAsync(cancellationToken);
        await RunProcessAsync("sc.exe", ["delete", InstallerConstants.ServiceName], false, cancellationToken);
        await RunProcessAsync(
            "schtasks.exe",
            ["/Delete", "/TN", InstallerConstants.InteractiveTaskName, "/F"],
            false,
            cancellationToken);
        RemoveCertificate();

        DeleteIfPresent(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
            "El Templo CRM.lnk"));
        DeleteIfPresent(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
            "El Templo CRM.url"));
        var menuDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms),
            "El Templo Huella");
        DeleteDirectoryIfPresent(menuDirectory);
        DeleteDirectoryIfPresent(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms),
            "El Templo CRM"));

        using (var uninstall = Registry.LocalMachine.OpenSubKey(
                   @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                   writable: true))
        {
            uninstall?.DeleteSubKeyTree("ElTemploHuella", throwOnMissingSubKey: false);
            uninstall?.DeleteSubKeyTree("ElTemploCRM", throwOnMissingSubKey: false);
        }

        var configDirectory = AgentPaths.DefaultConfigDirectory();
        if (Directory.Exists(configDirectory)) Directory.Delete(configDirectory, recursive: true);
        DeleteDirectoryIfPresent(InstallerConstants.AgentDirectory);
        DeleteDirectoryIfPresent(InstallerConstants.LegacyDesktopDirectory);

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
            throw new PlatformNotSupportedException("El Templo Huella requiere Windows 10 u 11 de 64 bits.");
        }
    }

    private static async Task ExtractResourceAsync(
        string resourceName,
        string destinationPath,
        CancellationToken cancellationToken)
    {
        await OperationRetrier.RunAsync(
            async () =>
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
            },
            attempts: 12,
            delay: TimeSpan.FromMilliseconds(500),
            cancellationToken);
    }

    private static async Task CopyInstallerForRepairAsync(CancellationToken cancellationToken)
    {
        var current = Environment.ProcessPath
            ?? throw new InvalidOperationException("No pudimos localizar el instalador actual.");
        if (!string.Equals(current, InstallerConstants.InstalledSetupExecutable, StringComparison.OrdinalIgnoreCase))
        {
            await OperationRetrier.RunAsync(
                () =>
                {
                    File.Copy(current, InstallerConstants.InstalledSetupExecutable, overwrite: true);
                    return Task.CompletedTask;
                },
                attempts: 12,
                delay: TimeSpan.FromMilliseconds(500),
                cancellationToken);
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
        var interactiveUser = WindowsIdentity.GetCurrent().User?.Value
            ?? throw new InvalidOperationException("No pudimos proteger la configuración para el usuario de Windows actual.");
        RunProcessAsync(
                "icacls.exe",
                [
                    AgentPaths.DefaultConfigDirectory(),
                    "/inheritance:r",
                    "/grant:r",
                    "*S-1-5-18:(OI)(CI)F",
                    "*S-1-5-32-544:(OI)(CI)F",
                    $"*{interactiveUser}:(OI)(CI)F",
                ],
                false,
                CancellationToken.None)
            .GetAwaiter()
            .GetResult();
    }

    private static async Task CreateInternetShortcutAsync(
        string shortcutPath,
        CancellationToken cancellationToken)
    {
        var contents = string.Join(
            Environment.NewLine,
            "[InternetShortcut]",
            $"URL={InstallerConstants.CrmUrl}",
            $"IconFile={InstallerConstants.AgentExecutable}",
            "IconIndex=0");
        await File.WriteAllTextAsync(shortcutPath, contents, cancellationToken);
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
        using (var uninstall = Registry.LocalMachine.OpenSubKey(
                   @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                   writable: true))
        {
            uninstall?.DeleteSubKeyTree("ElTemploCRM", throwOnMissingSubKey: false);
        }

        using var key = Registry.LocalMachine.CreateSubKey(
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ElTemploHuella",
            writable: true);
        key.SetValue("DisplayName", InstallerConstants.ProductName);
        key.SetValue("DisplayVersion", InstallerConstants.ProductVersion);
        key.SetValue("Publisher", "El Templo");
        key.SetValue("InstallLocation", InstallerConstants.ProductDirectory);
        key.SetValue("DisplayIcon", InstallerConstants.AgentExecutable);
        key.SetValue("UninstallString", $"\"{InstallerConstants.InstalledSetupExecutable}\" --uninstall");
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 0, RegistryValueKind.DWord);
    }

    private static bool TryRemoveLegacyDesktopPayload()
    {
        try
        {
            DeleteDirectoryIfPresent(InstallerConstants.LegacyDesktopDirectory);
            DeleteIfPresent(InstallerConstants.LegacySetupExecutable);
            return true;
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }

    private static async Task StopServiceIfPresentAsync(CancellationToken cancellationToken)
    {
        var initialState = await QueryServiceStateAsync(cancellationToken);
        if (initialState is null or "STOPPED") return;
        await RunProcessAsync("sc.exe", ["stop", InstallerConstants.ServiceName], false, cancellationToken);
        for (var attempt = 0; attempt < 30; attempt++)
        {
            if (await QueryServiceStateAsync(cancellationToken) == "STOPPED") return;
            await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);
        }

        await RunProcessAsync(
            "taskkill.exe",
            ["/F", "/FI", $"SERVICES eq {InstallerConstants.ServiceName}"],
            false,
            cancellationToken);
        for (var attempt = 0; attempt < 10; attempt++)
        {
            if (await QueryServiceStateAsync(cancellationToken) == "STOPPED") return;
            await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);
        }
        throw new IOException("El servicio anterior no liberó los archivos de instalación.");
    }

    private static async Task<string?> QueryServiceStateAsync(CancellationToken cancellationToken)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "sc.exe",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            },
        };
        process.StartInfo.ArgumentList.Add("query");
        process.StartInfo.ArgumentList.Add(InstallerConstants.ServiceName);
        process.Start();
        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var output = await outputTask;
        _ = await errorTask;
        if (process.ExitCode != 0) return null;
        if (output.Contains("STOPPED", StringComparison.OrdinalIgnoreCase)) return "STOPPED";
        if (output.Contains("STOP_PENDING", StringComparison.OrdinalIgnoreCase)) return "STOP_PENDING";
        if (output.Contains("RUNNING", StringComparison.OrdinalIgnoreCase)) return "RUNNING";
        return "UNKNOWN";
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
