using System.Collections.Concurrent;
using Pulso.Agent.Core.Ports;
using Pulso.Agent.Protocol.Payloads;

namespace Pulso.Agent.Core.Tests.TestDoubles;

/// <summary>Doble de IOperationNotifier: guarda cada llamada en orden para aserciones.</summary>
public sealed class RecordingNotifier : IOperationNotifier
{
    public ConcurrentQueue<object> Events { get; } = new();

    public void EnrollProgress(EnrollProgressPayload payload) => Events.Enqueue(payload);

    public void EnrollCompleted(EnrollCompletedPayload payload) => Events.Enqueue(payload);

    public void EnrollFailed(EnrollFailedPayload payload) => Events.Enqueue(payload);

    public void IdentifyCaptured(IdentifyCapturedPayload payload) => Events.Enqueue(payload);

    public void IdentifySent(IdentifySentPayload payload) => Events.Enqueue(payload);

    public void IdentifyFailed(IdentifyFailedPayload payload) => Events.Enqueue(payload);

    public void OperationCancelled(OperationCancelledPayload payload) => Events.Enqueue(payload);

    public IEnumerable<T> OfType<T>() => Events.OfType<T>();
}
