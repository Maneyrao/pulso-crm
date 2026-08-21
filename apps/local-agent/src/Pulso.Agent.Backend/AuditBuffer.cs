using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Pulso.Agent.Backend.Http;
using Pulso.Agent.Core.Ports;

namespace Pulso.Agent.Backend;

/// <summary>
/// Acumula AgentAuditEvent y los envía en lote cada 60s o al llegar a 50
/// (LOCAL_AGENT_ARCHITECTURE.md §4, componente AuditBuffer). Si el backend está caído, sigue
/// acumulando hasta 500 eventos y descarta los más viejos, registrando la pérdida (§8). Nunca
/// contiene imágenes, templates ni PII — sólo lo que ya pasó por <see cref="IAgentAuditSink"/>.
/// </summary>
public sealed class AuditBuffer(BackendClient backendClient, ISecretStore secretStore, ILogger<AuditBuffer> logger)
    : BackgroundService, IAgentAuditSink
{
    private const int MaxBuffered = 500;
    private const int FlushBatchSize = 50;
    private static readonly TimeSpan FlushInterval = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

    private readonly object _lock = new();
    private readonly Queue<AgentAuditEventDto> _queue = new();
    private long _droppedCount;

    public void Record(string type, string severity, string message, IReadOnlyDictionary<string, string>? metadata = null)
    {
        var evt = new AgentAuditEventDto
        {
            Type = type,
            Severity = severity,
            Message = message,
            Metadata = metadata,
            OccurredAt = DateTimeOffset.UtcNow,
        };

        lock (_lock)
        {
            _queue.Enqueue(evt);
            while (_queue.Count > MaxBuffered)
            {
                _queue.Dequeue();
                _droppedCount++;
                logger.LogWarning("AuditBuffer lleno ({Max}); se descartó el evento más viejo. Total descartados: {Dropped}.",
                    MaxBuffered, _droppedCount);
            }
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var lastFlush = DateTimeOffset.UtcNow;
        using var timer = new PeriodicTimer(PollInterval);

        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                int count;
                lock (_lock)
                {
                    count = _queue.Count;
                }

                var flushDue = DateTimeOffset.UtcNow - lastFlush >= FlushInterval;
                if (count >= FlushBatchSize || (flushDue && count > 0))
                {
                    await FlushAsync(stoppingToken).ConfigureAwait(false);
                    lastFlush = DateTimeOffset.UtcNow;
                }
            }
        }
        catch (OperationCanceledException)
        {
            // apagado normal
        }

        await FlushAsync(CancellationToken.None).ConfigureAwait(false);
    }

    private async Task FlushAsync(CancellationToken ct)
    {
        List<AgentAuditEventDto> batch;
        lock (_lock)
        {
            if (_queue.Count == 0)
            {
                return;
            }

            batch = new List<AgentAuditEventDto>(Math.Min(_queue.Count, FlushBatchSize));
            while (_queue.Count > 0 && batch.Count < FlushBatchSize)
            {
                batch.Add(_queue.Dequeue());
            }
        }

        var credential = await secretStore.RetrieveAsync(SecretKeys.AgentCredential, ct).ConfigureAwait(false);
        if (credential is null)
        {
            logger.LogDebug("Sin agentCredential todavía; se descartan {Count} eventos de auditoría.", batch.Count);
            return;
        }

        try
        {
            await backendClient.SendEventsAsync(credential, batch, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudieron enviar {Count} eventos de auditoría (se pierden; no hay backlog persistente).", batch.Count);
        }
    }
}
