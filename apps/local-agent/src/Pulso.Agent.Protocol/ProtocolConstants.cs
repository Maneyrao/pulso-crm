namespace Pulso.Agent.Protocol;

/// <summary>
/// Constantes fijas del protocolo WS local, ver docs/biometrics/WEBSOCKET_PROTOCOL.md.
/// </summary>
public static class ProtocolConstants
{
    /// <summary>Versión completa que el agente declara en hello.ack / status.</summary>
    public const string Version = "1.0";

    /// <summary>Versión mayor soportada. Un cliente con mayor distinto recibe PROTOCOL_VERSION_UNSUPPORTED.</summary>
    public const string MajorVersion = "1";

    /// <summary>Tamaño máximo de un mensaje completo (envelope + payload), en bytes. §5.</summary>
    public const int MaxMessageSizeBytes = 256 * 1024;

    /// <summary>Ventana para recibir "hello" tras el upgrade. §4.2 / cierre 4004.</summary>
    public static readonly TimeSpan HelloTimeout = TimeSpan.FromSeconds(5);

    /// <summary>Intervalo esperado de ping/pong. §7 del arquitectura.</summary>
    public static readonly TimeSpan PingInterval = TimeSpan.FromSeconds(15);

    /// <summary>Timeout de una sola captura de muestra. §7.</summary>
    public static readonly TimeSpan CaptureTimeout = TimeSpan.FromSeconds(20);

    /// <summary>Timeout de una sesión de enrolamiento completa. §7.</summary>
    public static readonly TimeSpan EnrollSessionTimeout = TimeSpan.FromSeconds(120);

    /// <summary>Inactividad máxima en modo identificación continua. §7.</summary>
    public static readonly TimeSpan IdentifyIdleTimeout = TimeSpan.FromSeconds(300);

    /// <summary>TTL nominal de un deviceToken emitido por el backend. §7.</summary>
    public static readonly TimeSpan DeviceTokenTtl = TimeSpan.FromSeconds(120);

    /// <summary>Máximo de muestras por enrolamiento.</summary>
    public const int MaxEnrollSamples = 5;

    /// <summary>Máximo de identificaciones por minuto (coincide con el rate limit del backend).</summary>
    public const int MaxIdentificationsPerMinute = 60;

    /// <summary>Extrae la parte mayor de una cadena de versión "1.0" -> "1".</summary>
    public static string MajorOf(string version)
    {
        var dot = version.IndexOf('.');
        return dot < 0 ? version : version[..dot];
    }
}
