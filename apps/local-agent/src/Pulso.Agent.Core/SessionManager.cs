namespace Pulso.Agent.Core;

public enum OperationKind
{
    Enroll,
    Identify,
}

/// <summary>Handle de la única operación de hardware activa.</summary>
public sealed class OperationHandle(string opId, OperationKind kind)
{
    public string OpId { get; } = opId;
    public OperationKind Kind { get; } = kind;
    public CancellationTokenSource Cts { get; } = new();

    /// <summary>Se completa cuando End/CancelCurrent liberan el slot (lo espera BeginAsync).</summary>
    internal TaskCompletionSource Released { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
}

/// <summary>Se lanza cuando se pide iniciar una operación mientras otra está en curso.</summary>
public sealed class AgentBusyException(string currentOpId) : Exception($"El agente ya tiene una operación en curso: {currentOpId}.")
{
    public string CurrentOpId { get; } = currentOpId;
}

/// <summary>
/// Garantiza una sola operación de hardware en curso a la vez (LOCAL_AGENT_ARCHITECTURE.md §4,
/// componente SessionManager). Una segunda solicitud recibe AGENT_BUSY. Thread-safe.
/// </summary>
public sealed class SessionManager
{
    private readonly object _lock = new();
    private OperationHandle? _current;

    public OperationHandle? Current
    {
        get
        {
            lock (_lock)
            {
                return _current;
            }
        }
    }

    /// <summary>
    /// Intenta abrir una operación. Lanza <see cref="AgentBusyException"/> si ya hay una en curso.
    /// </summary>
    public OperationHandle Begin(string opId, OperationKind kind)
    {
        lock (_lock)
        {
            if (_current is not null)
            {
                throw new AgentBusyException(_current.OpId);
            }

            _current = new OperationHandle(opId, kind);
            return _current;
        }
    }

    /// <summary>
    /// Como <see cref="Begin"/>, pero tolera el teardown de una operación ya cancelada: si la activa
    /// tiene la cancelación pedida (identify.stop / operation.cancel en curso), espera hasta
    /// <paramref name="teardownGrace"/> a que libere el slot en vez de tirar AGENT_BUSY. El protocolo
    /// no define un ack para identify.stop (WEBSOCKET_PROTOCOL.md §6.1), así que el cliente no tiene
    /// ningún mensaje con el que sincronizar el stop→start; esta gracia elimina esa carrera. Una
    /// operación activa NO cancelada sigue rechazándose inmediato con AGENT_BUSY.
    /// </summary>
    public async Task<OperationHandle> BeginAsync(
        string opId, OperationKind kind, TimeSpan teardownGrace, CancellationToken ct = default)
    {
        var deadline = System.Diagnostics.Stopwatch.StartNew();
        while (true)
        {
            Task releasedTask;
            lock (_lock)
            {
                if (_current is null)
                {
                    _current = new OperationHandle(opId, kind);
                    return _current;
                }

                if (!_current.Cts.IsCancellationRequested)
                {
                    throw new AgentBusyException(_current.OpId);
                }

                releasedTask = _current.Released.Task;
            }

            var remaining = teardownGrace - deadline.Elapsed;
            if (remaining <= TimeSpan.Zero
                || await Task.WhenAny(releasedTask, Task.Delay(remaining, ct)).ConfigureAwait(false) != releasedTask)
            {
                lock (_lock)
                {
                    if (_current is not null)
                    {
                        throw new AgentBusyException(_current.OpId);
                    }
                }
            }
        }
    }

    /// <summary>Cierra la operación si es la activa. No-op si ya se cerró o es de otro opId.</summary>
    public void End(string opId)
    {
        lock (_lock)
        {
            if (_current?.OpId == opId)
            {
                var handle = _current;
                _current = null;
                handle.Cts.Dispose();
                handle.Released.TrySetResult();
            }
        }
    }

    /// <summary>Cancela y cierra la operación activa, sea cual sea su opId. Usado en session.replaced.</summary>
    public void CancelCurrent(string reason)
    {
        lock (_lock)
        {
            if (_current is null)
            {
                return;
            }

            if (!_current.Cts.IsCancellationRequested)
            {
                _current.Cts.Cancel();
            }

            var handle = _current;
            _current = null;
            handle.Cts.Dispose();
            handle.Released.TrySetResult();
        }
    }
}
