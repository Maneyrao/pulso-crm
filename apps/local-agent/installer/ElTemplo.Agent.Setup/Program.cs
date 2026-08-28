using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using Pulso.Agent.Backend;
using Pulso.Agent.Backend.Http;
using Pulso.Agent.Sensors.WbfFingerJetSensor;

const string ServiceName = "ElTemploAgent";
const string BackendUrl = "https://api-production-c724.up.railway.app";
const string DriverUrl = "https://www.hidglobal.com/drivers/39477";

Console.Title = "El Templo Agent - Instalador";
Console.WriteLine("========================================");
Console.WriteLine(" El Templo Agent - Lector de huellas");
Console.WriteLine("========================================\n");

if (!OperatingSystem.IsWindows())
{
    Console.Error.WriteLine("Este instalador sólo funciona en Windows 10/11 de 64 bits.");
    return 2;
}

try
{
    var options = InstallerOptions.Parse(args);
    if (options.Uninstall)
    {
        Uninstall();
        Console.WriteLine("El Templo Agent fue desinstalado.");
        return 0;
    }

    var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
    var installDirectory = Path.Combine(programFiles, "El Templo", "Agent");
    var executablePath = Path.Combine(installDirectory, "ElTemploAgent.exe");
    var configDirectory = AgentPaths.DefaultConfigDirectory();
    var certificatePath = Path.Combine(configDirectory, "localhost.pfx");

    StopServiceIfPresent();
    Directory.CreateDirectory(installDirectory);
    Directory.CreateDirectory(configDirectory);
    ExtractAgent(executablePath);
    CreateLocalCertificate(certificatePath);
    RestrictConfigDirectory(configDirectory);

    var configStore = new ConfigStore();
    var config = await configStore.LoadAsync();
    config.BackendBaseUrl = options.BackendUrl ?? BackendUrl;
    config.AllowedOrigins =
    [
        "https://pulso-crm-omega.vercel.app",
        "https://pulso-crm-maneyraos-projects.vercel.app",
        "http://localhost:3000",
        "http://localhost:4000",
    ];
    config.WsPort = 21987;
    config.SensorKind = "wbf";
    config.TlsEnabled = true;
    config.TlsCertPath = certificatePath;
    config.TlsCertPassword = string.Empty;
    config.Environment = "production";

    var secretStore = new DpapiSecretStore();
    var credential = await secretStore.RetrieveAsync(SecretKeys.AgentCredential);
    if (credential is null)
    {
        var installationId = options.InstallationId ?? Prompt("ID de instalación del CRM");
        var pairingSecret = options.PairingSecret ?? Prompt("Secreto de pareo del CRM");
        using var http = new HttpClient { BaseAddress = new Uri(config.BackendBaseUrl), Timeout = TimeSpan.FromSeconds(20) };
        var client = new BackendClient(http);
        Console.WriteLine("\nPareando con El Templo CRM...");
        var paired = await client.PairAsync(new PairRequest
        {
            InstallationId = installationId,
            Secret = pairingSecret,
            MachineFingerprint = MachineFingerprint(),
            AgentVersion = AgentVersionInfo.Current,
            OsVersion = RuntimeInformation.OSDescription,
        });
        await secretStore.StoreAsync(SecretKeys.AgentCredential, paired.AgentCredential);
        config.AgentId = paired.AgentId;
        pairingSecret = string.Empty;
    }

    await configStore.SaveAsync(config);
    InstallOrUpdateService(executablePath);

    Console.WriteLine("\nComprobando el lector USB...");
    try
    {
        var readers = await new WindowsBiometricApi().EnumerateAsync(CancellationToken.None);
        if (readers.Count == 0)
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("No apareció ningún lector WBF. Instalá el driver HID WBF y reiniciá Windows:");
            Console.WriteLine(DriverUrl);
            Console.ResetColor();
        }
        else
        {
            foreach (var reader in readers)
            {
                Console.WriteLine($"OK: {reader.Manufacturer} {reader.Model} ({reader.DeviceInstanceId})");
            }
        }
    }
    catch (Exception ex)
    {
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine($"No se pudo validar el lector: {ex.Message}");
        Console.WriteLine($"Driver HID WBF: {DriverUrl}");
        Console.ResetColor();
    }

    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine("\nINSTALACIÓN COMPLETA");
    Console.ResetColor();
    Console.WriteLine("El servicio se inicia con Windows. Ya podés abrir el CRM y usar Huella.");
    if (!options.Quiet)
    {
        Console.WriteLine("\nPresioná Enter para cerrar.");
        Console.ReadLine();
    }
    return 0;
}
catch (Exception ex)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.Error.WriteLine($"\nNo se pudo instalar: {ex.Message}");
    Console.ResetColor();
    Console.Error.WriteLine("No se guardan imágenes ni huellas crudas durante la instalación.");
    if (!args.Contains("--quiet", StringComparer.OrdinalIgnoreCase))
    {
        Console.WriteLine("\nPresioná Enter para cerrar.");
        Console.ReadLine();
    }
    return 1;
}

static void ExtractAgent(string path)
{
    using var payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("ElTemploAgent.exe")
        ?? throw new InvalidOperationException("El instalador no contiene el agente. Volvé a descargarlo.");
    using var destination = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None);
    payload.CopyTo(destination);
}

static void CreateLocalCertificate(string pfxPath)
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
    san.AddIpAddress(System.Net.IPAddress.Loopback);
    request.CertificateExtensions.Add(san.Build());

    using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(5));
    File.WriteAllBytes(pfxPath, certificate.Export(X509ContentType.Pfx, string.Empty));
    using var trustedRoot = new X509Store(StoreName.Root, StoreLocation.LocalMachine);
    trustedRoot.Open(OpenFlags.ReadWrite);
    trustedRoot.Add(new X509Certificate2(certificate.Export(X509ContentType.Cert)));
}

static void RestrictConfigDirectory(string directory)
{
    Run("icacls.exe", [directory, "/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F"], false);
}

static void InstallOrUpdateService(string executablePath)
{
    var query = Run("sc.exe", ["query", ServiceName], false);
    if (query == 0)
    {
        Run("sc.exe", ["config", ServiceName, "binPath=", $"\"{executablePath}\"", "start=", "auto", "obj=", "LocalSystem"]);
    }
    else
    {
        Run("sc.exe", ["create", ServiceName, "binPath=", $"\"{executablePath}\"", "start=", "auto", "obj=", "LocalSystem", "DisplayName=", "El Templo Agent"]);
    }

    Run("sc.exe", ["description", ServiceName, "Conecta el lector HID U.are.U 4500 con El Templo CRM."], false);
    Run("sc.exe", ["failure", ServiceName, "reset=", "86400", "actions=", "restart/5000/restart/15000/restart/60000"], false);
    Run("sc.exe", ["start", ServiceName]);
}

static void StopServiceIfPresent()
{
    if (Run("sc.exe", ["query", ServiceName], false) == 0)
    {
        Run("sc.exe", ["stop", ServiceName], false);
        Thread.Sleep(1_500);
    }
}

static void Uninstall()
{
    StopServiceIfPresent();
    Run("sc.exe", ["delete", ServiceName], false);
    var installDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "El Templo", "Agent");
    if (Directory.Exists(installDirectory)) Directory.Delete(installDirectory, true);
}

static int Run(string fileName, IReadOnlyList<string> arguments, bool throwOnError = true)
{
    using var process = new Process
    {
        StartInfo = new ProcessStartInfo
        {
            FileName = fileName,
            UseShellExecute = false,
            CreateNoWindow = true,
        },
    };
    foreach (var argument in arguments) process.StartInfo.ArgumentList.Add(argument);
    process.Start();
    process.WaitForExit();
    if (throwOnError && process.ExitCode != 0)
    {
        throw new InvalidOperationException($"{fileName} terminó con código {process.ExitCode}.");
    }
    return process.ExitCode;
}

static string Prompt(string label)
{
    Console.Write($"{label}: ");
    var value = Console.ReadLine()?.Trim();
    if (string.IsNullOrWhiteSpace(value)) throw new InvalidOperationException($"{label} es obligatorio.");
    return value;
}

static string MachineFingerprint()
{
    var material = $"{Environment.MachineName}|{Environment.UserName}|{RuntimeInformation.OSDescription}";
    return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(material))).ToLowerInvariant();
}

internal sealed record InstallerOptions(
    string? InstallationId,
    string? PairingSecret,
    string? BackendUrl,
    bool Quiet,
    bool Uninstall)
{
    public static InstallerOptions Parse(string[] args)
    {
        string? installationId = null;
        string? pairingSecret = null;
        string? backendUrl = null;
        var quiet = false;
        var uninstall = false;
        for (var index = 0; index < args.Length; index++)
        {
            switch (args[index].ToLowerInvariant())
            {
                case "--installation-id": installationId = RequireValue(args, ref index); break;
                case "--secret": pairingSecret = RequireValue(args, ref index); break;
                case "--backend-url": backendUrl = RequireValue(args, ref index); break;
                case "--quiet": quiet = true; break;
                case "--uninstall": uninstall = true; break;
                default: throw new ArgumentException($"Argumento desconocido: {args[index]}");
            }
        }
        return new InstallerOptions(installationId, pairingSecret, backendUrl, quiet, uninstall);
    }

    private static string RequireValue(string[] args, ref int index)
    {
        if (++index >= args.Length || string.IsNullOrWhiteSpace(args[index]))
            throw new ArgumentException("Falta el valor de un argumento.");
        return args[index];
    }
}
