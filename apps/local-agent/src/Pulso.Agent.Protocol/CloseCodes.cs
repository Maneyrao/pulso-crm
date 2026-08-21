namespace Pulso.Agent.Protocol;

/// <summary>Códigos de cierre del WebSocket local (WEBSOCKET_PROTOCOL.md §8).</summary>
public static class CloseCodes
{
    public const int Normal = 1000;
    public const int SessionReplaced = 4001;
    public const int OriginRejected = 4003;
    public const int HelloTimeout = 4004;
    public const int PingPongLost = 4008;
    public const int MessageTooLarge = 4009;
    public const int ProtocolVersionIncompatible = 4010;
}
