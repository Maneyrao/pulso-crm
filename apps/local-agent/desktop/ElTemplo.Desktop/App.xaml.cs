using System.Windows;

namespace ElTemplo.Desktop;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(
                "El Templo CRM encontró un problema inesperado. Cerrá la aplicación y volvé a abrirla.",
                "El Templo CRM",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            args.Handled = true;
            Shutdown(1);
        };
        base.OnStartup(e);
    }
}
