using Pulso.Agent.Core.Ports;
using Pulso.Agent.Protocol;
using Pulso.Agent.Protocol.Payloads;

namespace Pulso.Agent.Host.Ws;

/// <summary>
/// Traduce los callbacks de OperationCoordinator a mensajes del WS local, enviándolos a la
/// conexión activa (WEBSOCKET_PROTOCOL.md §6.2). Simplificación documentada: apunta siempre a
/// <see cref="ConnectionRegistry.Current"/> al momento del envío; en el caso extremadamente
/// improbable de un reemplazo de conexión a mitad de una operación ya cancelada, un mensaje final
/// tardío podría llegar a la conexión nueva. No hay PII en juego, así que no es un riesgo de
/// seguridad — sólo una prolijidad pendiente (ver README, "Pendientes").
/// </summary>
public sealed class AgentConnectionNotifier(ConnectionRegistry registry) : IOperationNotifier
{
    public void EnrollProgress(EnrollProgressPayload payload) => Send(MessageTypes.EnrollProgress, payload);

    public void EnrollCompleted(EnrollCompletedPayload payload) => Send(MessageTypes.EnrollCompleted, payload);

    public void EnrollFailed(EnrollFailedPayload payload) => Send(MessageTypes.EnrollFailed, payload);

    public void IdentifyCaptured(IdentifyCapturedPayload payload) => Send(MessageTypes.IdentifyCaptured, payload);

    public void IdentifySent(IdentifySentPayload payload) => Send(MessageTypes.IdentifySent, payload);

    public void IdentifyFailed(IdentifyFailedPayload payload) => Send(MessageTypes.IdentifyFailed, payload);

    public void OperationCancelled(OperationCancelledPayload payload) => Send(MessageTypes.OperationCancelled, payload);

    private void Send<TPayload>(string type, TPayload payload)
    {
        var connection = registry.Current;
        if (connection is null)
        {
            return;
        }

        var json = MessageCodec.Serialize(type, payload);
        _ = SendSafeAsync(connection, json);
    }

    private static async Task SendSafeAsync(AgentConnection connection, string json)
    {
        try
        {
            await connection.SendAsync(json, CancellationToken.None).ConfigureAwait(false);
        }
        catch
        {
            // fire-and-forget: una notificación perdida no debe tumbar OperationCoordinator.
        }
    }
}
