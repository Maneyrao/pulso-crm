using System.ComponentModel;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using ElTemplo.Setup.Core;

namespace ElTemplo.Agent.Setup;

public partial class MainWindow : Window
{
    private static readonly Brush Muted = new SolidColorBrush(Color.FromRgb(126, 116, 105));
    private static readonly Brush Active = new SolidColorBrush(Color.FromRgb(245, 239, 230));
    private static readonly Brush Complete = new SolidColorBrush(Color.FromRgb(101, 183, 123));
    private readonly InstallLogger _logger = new();
    private readonly AgentPairer _pairer = new();
    private readonly ReaderProbe _reader = new();
    private CancellationTokenSource? _operation;
    private CrmProvisioningClient? _crm;
    private CrmSession? _session;
    private PreflightResult? _preflight;
    private SetupResult? _result;
    private int _page;
    private bool _busy;
    private bool _paired;
    private string? _pendingApprovalAgentId;

    public MainWindow()
    {
        InitializeComponent();
        UpdateStepRail();
    }

    private async void Primary_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        switch (_page)
        {
            case 0:
                await ShowChecksAsync();
                break;
            case 1:
                await ContinueAfterChecksAsync();
                break;
            case 2:
                await LoginAsync();
                break;
            case 3:
                await InstallAsync();
                break;
            case 5:
                ShowPage(6);
                break;
            case 6:
                WindowsInstallerPlatform.LaunchWebCrm();
                Close();
                break;
        }
    }

    private void Back_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        if (_page == 2) ShowPage(1);
        else if (_page == 3) ShowPage(2);
    }

    private async void Retry_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        if (_page == 1) await RunChecksAsync();
        else if (_page == 4) await InstallAsync();
        else if (_page == 5) await CheckReaderAgainAsync();
    }

    private async Task ShowChecksAsync()
    {
        ShowPage(1);
        await RunChecksAsync();
    }

    private async Task RunChecksAsync()
    {
        SetBusy(true);
        ChecksList.Children.Clear();
        ChecksError.Text = string.Empty;
        ChecksProgress.Visibility = Visibility.Visible;
        try
        {
            _operation = new CancellationTokenSource();
            _preflight = await SystemPreflight.RunAsync(_operation.Token);
            RenderChecks(_preflight);
            if (!_preflight.CanContinue)
            {
                ChecksError.Text = "Corregí los puntos marcados en rojo y pulsá Probar otra vez.";
            }
        }
        catch
        {
            ChecksError.Text = "No pudimos terminar la comprobación. Revisá Internet y probá otra vez.";
            _logger.Error("PREFLIGHT_FAILED", "UnhandledPreflightError");
        }
        finally
        {
            ChecksProgress.Visibility = Visibility.Collapsed;
            SetBusy(false);
            UpdateButtons();
        }
    }

    private async Task ContinueAfterChecksAsync()
    {
        if (_preflight is null || !_preflight.CanContinue)
        {
            await RunChecksAsync();
            return;
        }

        SetBusy(true);
        try
        {
            var link = await _pairer.GetLinkStateAsync(CancellationToken.None);
            _paired = link.IsPaired;
            if (_paired && link.Status is "REVOKED" or "BLOCKED")
            {
                await _pairer.ClearPairingAsync(CancellationToken.None);
                _paired = false;
            }
            else if (_paired && !string.Equals(link.Status, "ACTIVE", StringComparison.OrdinalIgnoreCase))
            {
                _pendingApprovalAgentId = link.AgentId;
            }
        }
        catch
        {
            _paired = false;
        }
        finally
        {
            SetBusy(false);
        }

        if (_paired && _pendingApprovalAgentId is null)
        {
            ShowPage(4);
            await InstallAsync();
        }
        else
        {
            ShowPage(2);
            EmailInput.Focus();
        }
    }

    private async Task LoginAsync()
    {
        LoginError.Text = string.Empty;
        if (string.IsNullOrWhiteSpace(EmailInput.Text) || string.IsNullOrWhiteSpace(PasswordInput.Password))
        {
            LoginError.Text = "Completá el email y la contraseña del CRM.";
            return;
        }

        SetBusy(true);
        try
        {
            _crm?.Dispose();
            _crm = new CrmProvisioningClient(new Uri(InstallerConstants.CrmApiUrl));
            _session = await _crm.LoginAsync(EmailInput.Text, PasswordInput.Password, CancellationToken.None);
            PasswordInput.Clear();
            if (_pendingApprovalAgentId is not null)
            {
                ShowPage(4);
                await InstallAsync();
                return;
            }
            BranchInput.ItemsSource = _session.Branches;
            BranchInput.SelectedValue = _session.ActiveBranchId;
            if (BranchInput.SelectedIndex < 0 && _session.Branches.Count > 0) BranchInput.SelectedIndex = 0;
            GymNameText.Text = $"Cuenta: {_session.GymName}. Elegí la sede a la que pertenece el lector.";
            ShowPage(3);
        }
        catch (CrmProvisioningException error)
        {
            LoginError.Text = error.Message;
            _logger.Error(error.Code, error.GetType().Name);
        }
        catch
        {
            LoginError.Text = "No pudimos conectar con el CRM. Revisá Internet y volvé a intentar.";
            _logger.Error("CRM_LOGIN_FAILED", "UnhandledLoginError");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async Task InstallAsync()
    {
        var branchId = _paired ? null : BranchInput.SelectedValue as string;
        if (!_paired && string.IsNullOrWhiteSpace(branchId))
        {
            BranchError.Text = "Elegí una sede para continuar.";
            return;
        }

        ShowPage(4);
        InstallErrorPanel.Visibility = Visibility.Collapsed;
        RetryButton.Visibility = Visibility.Collapsed;
        SetBusy(true);
        _operation = new CancellationTokenSource();
        try
        {
            _crm ??= new CrmProvisioningClient(new Uri(InstallerConstants.CrmApiUrl));
            if (_pendingApprovalAgentId is not null)
            {
                InstallProgress.Value = 50;
                InstallPercent.Text = "50%";
                InstallMessage.Text = "Retomamos la autorización de esta computadora.";
                await _crm.ApproveAgentAsync(_pendingApprovalAgentId, _operation.Token);
                _pendingApprovalAgentId = null;
            }
            var workflow = new SetupWorkflow(
                new WindowsInstallerPlatform(_logger),
                _crm,
                _pairer,
                _reader);
            var progress = new Progress<SetupProgress>(update =>
            {
                InstallProgress.Value = update.Percent;
                InstallPercent.Text = $"{update.Percent}%";
                InstallMessage.Text = update.Message;
            });
            _result = await workflow.RunAsync(
                new SetupRequest(branchId, $"Recepción - {Environment.MachineName}"),
                progress,
                _operation.Token);
            _logger.Info("SETUP_COMPLETED");
            RenderReader(_result.Reader);
            ShowPage(5);
        }
        catch (OperationCanceledException)
        {
            InstallError.Text = "La instalación fue cancelada. Podés retomarla pulsando Reintentar.";
            InstallErrorPanel.Visibility = Visibility.Visible;
            _logger.Info("SETUP_CANCELLED");
        }
        catch (SetupFailureException error)
        {
            InstallError.Text = FriendlySetupError(error) + " Pulsá Reintentar; no necesitás empezar de cero.";
            InstallErrorPanel.Visibility = Visibility.Visible;
            _logger.Error(error.DiagnosticCode, error.DiagnosticType);
        }
        catch (CrmProvisioningException error)
        {
            InstallError.Text = error.Message + " Pulsá Reintentar para retomar desde este punto.";
            InstallErrorPanel.Visibility = Visibility.Visible;
            _logger.Error(error.Code, error.GetType().Name);
        }
        catch
        {
            InstallError.Text = "No pudimos completar la instalación. Pulsá Reintentar; no necesitás empezar de cero.";
            InstallErrorPanel.Visibility = Visibility.Visible;
            _logger.Error("SETUP_UNEXPECTED_FAILURE", "UnhandledSetupError");
        }
        finally
        {
            SetBusy(false);
            if (_page == 4 && InstallErrorPanel.Visibility == Visibility.Visible)
            {
                RetryButton.Visibility = Visibility.Visible;
            }
        }
    }

    private static string FriendlySetupError(SetupFailureException error) => error.DiagnosticType switch
    {
        nameof(IOException) => "Windows todavía está usando un archivo anterior. Cerramos el agente y esperamos a que quede libre.",
        nameof(UnauthorizedAccessException) => "Windows no concedió permisos suficientes. Cerrá y abrí el instalador como administrador.",
        nameof(HttpRequestException) => "No pudimos conectar con el CRM. Revisá la conexión a Internet.",
        "CryptographicException" => "Windows no pudo preparar el certificado local del lector.",
        _ => error.Message,
    };

    private async Task CheckReaderAgainAsync()
    {
        SetBusy(true);
        try
        {
            RenderReader(await _reader.CheckAsync(CancellationToken.None));
        }
        finally
        {
            SetBusy(false);
            UpdateButtons();
        }
    }

    private static Border BuildCheck(PreflightCheck check)
    {
        var color = check.Passed
            ? new SolidColorBrush(Color.FromRgb(101, 183, 123))
            : check.Blocking
                ? new SolidColorBrush(Color.FromRgb(217, 107, 94))
                : new SolidColorBrush(Color.FromRgb(227, 174, 85));
        var row = new Grid();
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(30) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.Children.Add(new TextBlock
        {
            Text = check.Passed ? "✓" : "!",
            Foreground = color,
            FontSize = 18,
            FontWeight = FontWeights.Bold,
            VerticalAlignment = VerticalAlignment.Center,
        });
        var copy = new StackPanel();
        Grid.SetColumn(copy, 1);
        copy.Children.Add(new TextBlock { Text = check.Label, FontWeight = FontWeights.SemiBold, FontSize = 14 });
        copy.Children.Add(new TextBlock
        {
            Text = check.Detail,
            Foreground = new SolidColorBrush(Color.FromRgb(184, 173, 160)),
            Margin = new Thickness(0, 3, 0, 0),
            TextWrapping = TextWrapping.Wrap,
        });
        row.Children.Add(copy);
        return new Border
        {
            Child = row,
            Padding = new Thickness(13, 10, 13, 10),
            Margin = new Thickness(0, 0, 0, 8),
            BorderBrush = new SolidColorBrush(Color.FromRgb(59, 50, 40)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(4),
            Background = new SolidColorBrush(Color.FromRgb(27, 23, 19)),
        };
    }

    private void RenderChecks(PreflightResult result)
    {
        ChecksList.Children.Clear();
        foreach (var check in result.Checks) ChecksList.Children.Add(BuildCheck(check));
    }

    private void RenderReader(ReaderCheck reader)
    {
        if (reader.Detected)
        {
            ReaderSymbol.Text = "✓";
            ReaderSymbol.Foreground = Complete;
            ReaderTitle.Text = "Lector encontrado";
            ReaderMessage.Text = $"{reader.Manufacturer} {reader.Model} está conectado y listo para enrolar huellas.";
            ReaderHelp.Visibility = Visibility.Collapsed;
            FinishMessage.Text = "El agente se iniciará automáticamente con Windows. Ahora abriremos el CRM en tu navegador.";
        }
        else
        {
            ReaderSymbol.Text = "!";
            ReaderSymbol.Foreground = new SolidColorBrush(Color.FromRgb(227, 174, 85));
            ReaderTitle.Text = "El agente está instalado; falta el lector";
            ReaderMessage.Text = reader.UserMessage;
            ReaderHelp.Visibility = Visibility.Visible;
            FinishMessage.Text = "El agente quedó instalado. Para usar huellas, conectá el lector e instalá el controlador oficial desde el acceso de reparación.";
        }
        UpdateButtons();
    }

    private void Driver_Click(object sender, RoutedEventArgs e)
    {
        Process.Start(new ProcessStartInfo(InstallerConstants.DriverUrl) { UseShellExecute = true });
    }

    private void ShowPage(int page)
    {
        _page = page;
        WelcomePage.Visibility = page == 0 ? Visibility.Visible : Visibility.Collapsed;
        ChecksPage.Visibility = page == 1 ? Visibility.Visible : Visibility.Collapsed;
        LoginPage.Visibility = page == 2 ? Visibility.Visible : Visibility.Collapsed;
        BranchPage.Visibility = page == 3 ? Visibility.Visible : Visibility.Collapsed;
        InstallPage.Visibility = page == 4 ? Visibility.Visible : Visibility.Collapsed;
        ReaderPage.Visibility = page == 5 ? Visibility.Visible : Visibility.Collapsed;
        FinishPage.Visibility = page == 6 ? Visibility.Visible : Visibility.Collapsed;
        UpdateStepRail();
        UpdateButtons();
    }

    private void UpdateButtons()
    {
        BackButton.Visibility = !_busy && (_page == 2 || _page == 3) ? Visibility.Visible : Visibility.Collapsed;
        PrimaryButton.Visibility = _page == 4 ? Visibility.Collapsed : Visibility.Visible;
        PrimaryButton.IsEnabled = !_busy && (_page != 1 || (_preflight?.CanContinue ?? false));
        PrimaryButton.Content = _page switch
        {
            0 => "Comenzar",
            1 => "Continuar",
            2 => "Ingresar",
            3 => "Instalar",
            5 => "Continuar",
            6 => "Abrir CRM web",
            _ => "Continuar",
        };
        if (_page == 1) RetryButton.Visibility = !_busy && _preflight is not null && !_preflight.CanContinue
            ? Visibility.Visible
            : Visibility.Collapsed;
        else if (_page == 5) RetryButton.Visibility = !_busy && ReaderHelp.Visibility == Visibility.Visible
            ? Visibility.Visible
            : Visibility.Collapsed;
        else if (_page != 4) RetryButton.Visibility = Visibility.Collapsed;
    }

    private void UpdateStepRail()
    {
        var steps = new[] { Step0, Step1, Step2, Step3, Step4, Step5, Step6 };
        for (var index = 0; index < steps.Length; index++)
        {
            steps[index].Foreground = index < _page ? Complete : index == _page ? Active : Muted;
            steps[index].FontWeight = index == _page ? FontWeights.SemiBold : FontWeights.Normal;
        }
    }

    private void SetBusy(bool busy)
    {
        _busy = busy;
        PrimaryButton.IsEnabled = !busy;
        BackButton.IsEnabled = !busy;
        RetryButton.IsEnabled = !busy;
        Cursor = busy ? System.Windows.Input.Cursors.Wait : null;
        UpdateButtons();
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (!_busy) return;
        var result = MessageBox.Show(
            "La instalación todavía está trabajando. ¿Querés cancelarla y cerrar?",
            "Cerrar instalador",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning);
        if (result == MessageBoxResult.No)
        {
            e.Cancel = true;
            return;
        }
        _operation?.Cancel();
    }

    protected override void OnClosed(EventArgs e)
    {
        _crm?.Dispose();
        _operation?.Dispose();
        base.OnClosed(e);
    }
}
