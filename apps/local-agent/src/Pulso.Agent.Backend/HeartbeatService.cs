using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Pulso.Agent.Backend.Http;
using Pulso.Agent.Core;
using Pulso.Agent.Core.Ports;

namespace Pulso.Agent.Backend;

/// <summary>
/// POST /agent/heartbeat cada 30s (LOCAL_AGENT_ARCHITECTURE.md §4, §5.1). Refleja el resultado en
/// AgentStateMachine: ACTIVE completa la aprobación, REVOKED/BLOCKED pasa a Disabled, y una falla
/// de red mueve a BackendDown sin tocar pareo/aprobación.
/// </summary>
public sealed class HeartbeatService(
    BackendClient backendClient,
    ISecretStore secretStore,
    AgentStateMachine stateMachine,
    ILogger<HeartbeatService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                await HeartbeatOnceAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Heartbeat falló de forma inesperada.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }

    private async Task HeartbeatOnceAsync(CancellationToken ct)
    {
        var credential = await secretStore.RetrieveAsync(SecretKeys.AgentCredential, ct).ConfigureAwait(false);
        if (credential is null)
        {
            // NOT_CONFIGURED: todavía no se completó el pareo (POST /agent/pair).
            return;
        }

        try
        {
            var response = await backendClient.HeartbeatAsync(
                credential,
                new HeartbeatRequest { AgentState = stateMachine.Current.ToString(), AgentVersion = AgentVersionInfo.Current },
                ct).ConfigureAwait(false);

            ApplyStatus(response.Status, response.Reason);
            stateMachine.BackendReachable();
        }
        catch (BackendUnreachableException ex)
        {
            logger.LogWarning("Heartbeat sin respuesta del backend: {Message}", ex.Message);
            stateMachine.BackendUnreachable();
        }
        catch (BackendRejectedException ex) when (ex.Code is "AGENT_REVOKED")
        {
            stateMachine.Revoke(ex.Code);
        }
    }

    private void ApplyStatus(string status, string? reason)
    {
        if (stateMachine.Current == AgentState.NotConfigured)
        {
            // Hay credencial válida: el pareo ya ocurrió (por esta instancia o una anterior).
            stateMachine.Pair();
        }

        switch (status)
        {
            case "ACTIVE":
                if (stateMachine.Current == AgentState.PendingApproval)
                {
                    stateMachine.Approve();
                }

                break;
            case "REVOKED":
            case "BLOCKED":
                stateMachine.Revoke(reason ?? status);
                break;
            case "PENDING_APPROVAL":
            default:
                break;
        }
    }
}
