using System.Windows;

namespace ElTemplo.Agent.Setup;

public partial class App : Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        if (TryReadOption(e.Args, "--self-test", out _))
        {
            TryReadOption(e.Args, "--self-test-report", out var reportPath);
            Shutdown(await SelfTestRunner.RunAsync(reportPath));
            return;
        }

        if (TryReadOption(e.Args, "--uninstall", out _))
        {
            var confirmation = MessageBox.Show(
                "¿Querés desinstalar El Templo Huella y el servicio del lector de esta computadora?",
                "Desinstalar El Templo Huella",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);
            if (confirmation != MessageBoxResult.Yes)
            {
                Shutdown(0);
                return;
            }

            try
            {
                await WindowsInstallerPlatform.UninstallAsync(CancellationToken.None);
                MessageBox.Show(
                    "El Templo Huella fue desinstalado correctamente.",
                    "El Templo Huella",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
                Shutdown(0);
            }
            catch
            {
                MessageBox.Show(
                    "No pudimos completar la desinstalación. Reiniciá Windows y volvé a intentarlo.",
                    "El Templo Huella",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                Shutdown(1);
            }
            return;
        }

        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(
                "Ocurrió un problema inesperado. Cerrá el instalador y volvé a abrirlo.",
                "El Templo Huella",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            args.Handled = true;
        };

        ShutdownMode = ShutdownMode.OnMainWindowClose;
        MainWindow = new MainWindow();
        MainWindow.Show();
    }

    private static bool TryReadOption(string[] args, string name, out string? value)
    {
        value = null;
        var index = Array.FindIndex(args, argument => argument.Equals(name, StringComparison.OrdinalIgnoreCase));
        if (index < 0) return false;
        if (index + 1 < args.Length && !args[index + 1].StartsWith("--", StringComparison.Ordinal))
        {
            value = args[index + 1];
        }
        return true;
    }
}
