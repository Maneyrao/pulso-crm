namespace ElTemplo.Agent.Setup;

internal static class InstallerConstants
{
    public const string ProductName = "El Templo Huella";
    public const string ProductVersion = "0.4.0";
    public const string ServiceName = "ElTemploAgent";
    public const string InteractiveTaskName = "ElTemploHuellaAgent";
    public const string CrmUrl = "https://pulso-crm-omega.vercel.app/";
    public const string CrmApiUrl = "https://pulso-crm-omega.vercel.app/api/v1/";
    public const string BackendUrl = "https://api-production-c724.up.railway.app";
    public const string DriverUrl = "https://www.hidglobal.com/drivers/39477";

    public static readonly string ProductDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
        "El Templo");

    public static readonly string AgentDirectory = Path.Combine(ProductDirectory, "Agent");
    public static readonly string LegacyDesktopDirectory = Path.Combine(ProductDirectory, "CRM");
    public static readonly string InstallerDirectory = Path.Combine(ProductDirectory, "Installer");
    public static readonly string AgentExecutable = Path.Combine(AgentDirectory, "ElTemploAgent.exe");
    public static readonly string InstalledSetupExecutable = Path.Combine(InstallerDirectory, "ElTemploHuella-Setup.exe");
    public static readonly string LegacySetupExecutable = Path.Combine(InstallerDirectory, "ElTemploCRM-Setup.exe");
}
