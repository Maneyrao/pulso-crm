using System.Diagnostics;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace ElTemplo.Desktop;

public partial class MainWindow : Window
{
    private static readonly Uri CrmUri = new("https://pulso-crm-omega.vercel.app/login");
    private bool _initialized;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await InitializeBrowserAsync();
    }

    private async Task InitializeBrowserAsync()
    {
        ShowLoading();
        try
        {
            if (!_initialized)
            {
                var profile = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "El Templo",
                    "CRM",
                    "WebView2");
                Directory.CreateDirectory(profile);
                var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
                await Browser.EnsureCoreWebView2Async(environment);
                ConfigureBrowser();
                _initialized = true;
            }

            Browser.Source = CrmUri;
        }
        catch (WebView2RuntimeNotFoundException)
        {
            ShowError("Falta un componente de Windows necesario. Volvé a ejecutar el instalador de El Templo CRM para repararlo.");
        }
        catch
        {
            ShowError("Revisá la conexión a Internet y volvé a intentarlo.");
        }
    }

    private void ConfigureBrowser()
    {
        Browser.DefaultBackgroundColor = System.Drawing.Color.FromArgb(11, 10, 9);
        Browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
        Browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
        Browser.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = true;
        Browser.NavigationStarting += (_, _) => ShowLoading();
        Browser.NavigationCompleted += (_, args) =>
        {
            if (args.IsSuccess) ShowBrowser();
            else ShowError("No pudimos comunicarnos con el CRM. Revisá Internet y reintentá.");
        };
        Browser.CoreWebView2.ProcessFailed += (_, _) =>
            Dispatcher.Invoke(() => ShowError("La ventana del CRM se cerró inesperadamente. Reintentá para recuperarla."));
        Browser.CoreWebView2.NewWindowRequested += (_, args) =>
        {
            args.Handled = true;
            Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true });
        };
    }

    private async void Retry_Click(object sender, RoutedEventArgs e) => await InitializeBrowserAsync();

    private void ShowLoading()
    {
        Browser.Visibility = Visibility.Collapsed;
        ErrorPanel.Visibility = Visibility.Collapsed;
        LoadingPanel.Visibility = Visibility.Visible;
        ConnectionDot.Fill = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(215, 161, 58));
        ConnectionLabel.Text = "Conectando";
    }

    private void ShowBrowser()
    {
        LoadingPanel.Visibility = Visibility.Collapsed;
        ErrorPanel.Visibility = Visibility.Collapsed;
        Browser.Visibility = Visibility.Visible;
        ConnectionDot.Fill = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(78, 176, 111));
        ConnectionLabel.Text = "En línea";
    }

    private void ShowError(string message)
    {
        Browser.Visibility = Visibility.Collapsed;
        LoadingPanel.Visibility = Visibility.Collapsed;
        ErrorPanel.Visibility = Visibility.Visible;
        ErrorMessage.Text = message;
        ConnectionDot.Fill = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(204, 91, 76));
        ConnectionLabel.Text = "Sin conexión";
    }
}
