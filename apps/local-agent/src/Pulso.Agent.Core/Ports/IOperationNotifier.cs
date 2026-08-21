using Pulso.Agent.Protocol.Payloads;

namespace Pulso.Agent.Core.Ports;

/// <summary>
/// Puerto de salida de OperationCoordinator hacia el WS local. Pulso.Agent.Host implementa esto
/// serializando cada payload con MessageCodec y enviándolo por la conexión activa. Mantener Core
/// ajeno al transporte (WebSocket, Kestrel) es lo que permite testear la máquina de estados sin
/// levantar un servidor.
/// </summary>
public interface IOperationNotifier
{
    void EnrollProgress(EnrollProgressPayload payload);

    void EnrollCompleted(EnrollCompletedPayload payload);

    void EnrollFailed(EnrollFailedPayload payload);

    void IdentifyCaptured(IdentifyCapturedPayload payload);

    void IdentifySent(IdentifySentPayload payload);

    void IdentifyFailed(IdentifyFailedPayload payload);

    void OperationCancelled(OperationCancelledPayload payload);
}
