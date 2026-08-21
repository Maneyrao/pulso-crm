namespace Pulso.Agent.Host;

public static class HostConstants
{
    /// <summary>
    /// Margen sobre ProtocolConstants.PingInterval (15s) antes de considerar la conexión muerta
    /// (WEBSOCKET_PROTOCOL.md §8, close 4008). El cliente pinguea cada 15s; toleramos un ciclo
    /// perdido antes de cortar.
    /// </summary>
    public static readonly TimeSpan PingPongLostThreshold = TimeSpan.FromSeconds(20);

    public static readonly TimeSpan WatchdogPollInterval = TimeSpan.FromSeconds(2);
}
