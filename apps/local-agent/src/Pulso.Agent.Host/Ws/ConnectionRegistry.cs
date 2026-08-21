namespace Pulso.Agent.Host.Ws;

/// <summary>Garantiza "una conexión activa por vez" (WEBSOCKET_PROTOCOL.md §4.2).</summary>
public sealed class ConnectionRegistry
{
    private readonly object _lock = new();
    private AgentConnection? _current;

    public AgentConnection? Current
    {
        get
        {
            lock (_lock)
            {
                return _current;
            }
        }
    }

    /// <summary>Registra la nueva conexión como activa y devuelve la anterior, si había una.</summary>
    public AgentConnection? Replace(AgentConnection incoming)
    {
        lock (_lock)
        {
            var previous = _current;
            _current = incoming;
            return previous;
        }
    }

    public void Remove(AgentConnection connection)
    {
        lock (_lock)
        {
            if (ReferenceEquals(_current, connection))
            {
                _current = null;
            }
        }
    }
}
