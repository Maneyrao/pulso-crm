using System.Text;

namespace ElTemplo.Agent.Setup;

internal sealed class InstallLogger
{
    private readonly string _path;
    private readonly object _lock = new();

    public InstallLogger()
    {
        var directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "El Templo",
            "Installer");
        Directory.CreateDirectory(directory);
        _path = Path.Combine(directory, "install.log");
    }

    public string Path => _path;

    public void Info(string code) => Write("INFO", code, null);

    public void Error(string code, string diagnosticType) => Write("ERROR", code, diagnosticType);

    private void Write(string level, string code, string? diagnosticType)
    {
        var line = $"{DateTimeOffset.UtcNow:O}\t{level}\t{code}";
        if (!string.IsNullOrWhiteSpace(diagnosticType)) line += $"\t{diagnosticType}";
        lock (_lock)
        {
            File.AppendAllText(_path, line + Environment.NewLine, Encoding.UTF8);
        }
    }
}
