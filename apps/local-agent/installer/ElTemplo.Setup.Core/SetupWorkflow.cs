namespace ElTemplo.Setup.Core;

public sealed class SetupWorkflow(
    IInstallerPlatform platform,
    ICrmProvisioner crm,
    IAgentPairer pairer,
    IReaderProbe reader)
{
    public async Task<SetupResult> RunAsync(
        SetupRequest request,
        IProgress<SetupProgress>? progress,
        CancellationToken cancellationToken)
    {
        await RunStageAsync(
            SetupStage.PreparingFiles,
            "SETUP_PAYLOADS_FAILED",
            "No pudimos preparar los archivos de El Templo.",
            () => platform.InstallPayloadsAsync(cancellationToken));
        Report(progress, SetupStage.PreparingFiles, 15, "Preparamos la conexion segura del lector.");

        var wasRepair = await RunStageAsync(
            SetupStage.PreparingFiles,
            "SETUP_CREDENTIAL_CHECK_FAILED",
            "No pudimos comprobar la instalación existente.",
            () => pairer.IsPairedAsync(cancellationToken));

        if (!wasRepair)
        {
            if (string.IsNullOrWhiteSpace(request.BranchId))
            {
                throw new SetupFailureException(
                    SetupStage.ProvisioningAgent,
                    "SETUP_BRANCH_REQUIRED",
                    "Elegí la sede donde se usará esta computadora.",
                    nameof(ArgumentException));
            }

            Report(progress, SetupStage.ProvisioningAgent, 30, "Vinculamos esta computadora con la sede.");
            var provisioned = await RunStageAsync(
                SetupStage.ProvisioningAgent,
                "SETUP_PROVISIONING_FAILED",
                "No pudimos vincular esta computadora con el CRM.",
                () => crm.CreateAgentAsync(request.BranchId, request.AgentName, cancellationToken));

            Report(progress, SetupStage.PairingAgent, 45, "Protegemos la conexión del lector.");
            await RunStageAsync(
                SetupStage.PairingAgent,
                "SETUP_PAIRING_FAILED",
                "No pudimos proteger la conexión del lector.",
                () => pairer.PairAsync(
                    provisioned.InstallationId,
                    provisioned.PairingSecret,
                    cancellationToken));

            Report(progress, SetupStage.ApprovingAgent, 55, "Autorizamos esta computadora.");
            await RunStageAsync(
                SetupStage.ApprovingAgent,
                "SETUP_APPROVAL_FAILED",
                "La computadora se vinculó, pero no pudimos autorizarla.",
                () => crm.ApproveAgentAsync(provisioned.AgentId, cancellationToken));
        }
        else
        {
            Report(progress, SetupStage.PairingAgent, 55, "Conservamos la vinculación existente.");
        }

        Report(progress, SetupStage.InstallingService, 68, "Activamos el conector de huella en esta sesión de Windows.");
        await RunStageAsync(
            SetupStage.InstallingService,
            "SETUP_SERVICE_FAILED",
            "No pudimos activar el conector del lector.",
            () => platform.InstallServiceAsync(cancellationToken));

        Report(progress, SetupStage.DetectingReader, 82, "Buscamos el lector de huellas conectado.");
        var readerCheck = await RunStageAsync(
            SetupStage.DetectingReader,
            "SETUP_READER_CHECK_FAILED",
            "No pudimos comprobar el lector de huellas.",
            () => reader.CheckAsync(cancellationToken));

        Report(progress, SetupStage.CreatingShortcuts, 94, "Creamos el acceso directo.");
        await RunStageAsync(
            SetupStage.CreatingShortcuts,
            "SETUP_SHORTCUT_FAILED",
            "El agente quedó instalado, pero no pudimos crear el acceso directo.",
            () => platform.CreateShortcutsAsync(cancellationToken));

        Report(progress, SetupStage.Completed, 100, "El Templo Huella esta listo para el CRM web.");
        return new SetupResult(wasRepair, readerCheck);
    }

    private static void Report(
        IProgress<SetupProgress>? progress,
        SetupStage stage,
        int percent,
        string message) => progress?.Report(new SetupProgress(stage, percent, message));

    private static async Task RunStageAsync(
        SetupStage stage,
        string code,
        string userMessage,
        Func<Task> operation)
    {
        await RunStageAsync(
            stage,
            code,
            userMessage,
            async () =>
            {
                await operation();
                return true;
            });
    }

    private static async Task<T> RunStageAsync<T>(
        SetupStage stage,
        string code,
        string userMessage,
        Func<Task<T>> operation)
    {
        try
        {
            return await operation();
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (SetupFailureException)
        {
            throw;
        }
        catch (Exception error)
        {
            throw new SetupFailureException(stage, code, userMessage, error.GetType().Name);
        }
    }
}
