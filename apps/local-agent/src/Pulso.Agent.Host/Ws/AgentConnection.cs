using System.Net.WebSockets;
using System.Text;
using Pulso.Agent.Protocol;
using Pulso.Agent.Protocol.Payloads;

namespace Pulso.Agent.Host.Ws;

/// <summary>Envoltorio de un WebSocket activo con envío serializado (un socket no soporta sends concurrentes).</summary>
public sealed class AgentConnection(WebSocket socket)
{
    private readonly SemaphoreSlim _sendLock = new(1, 1);

    public WebSocket Socket { get; } = socket;

    /// <summary>Marca de actividad para el watchdog de ping/pong (§7/§8). UTC ticks, actualizable atómicamente.</summary>
    private long _lastActivityTicksUtc = DateTime.UtcNow.Ticks;

    public void Touch() => Interlocked.Exchange(ref _lastActivityTicksUtc, DateTime.UtcNow.Ticks);

    public TimeSpan IdleFor => DateTime.UtcNow - new DateTime(Interlocked.Read(ref _lastActivityTicksUtc), DateTimeKind.Utc);

    public async Task SendAsync(string json, CancellationToken ct)
    {
        if (Socket.State != WebSocketState.Open)
        {
            return;
        }

        var bytes = Encoding.UTF8.GetBytes(json);
        await _sendLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (Socket.State == WebSocketState.Open)
            {
                await Socket.SendAsync(bytes, WebSocketMessageType.Text, endOfMessage: true, ct).ConfigureAwait(false);
            }
        }
        finally
        {
            _sendLock.Release();
        }
    }

    /// <summary>§4.2: a la conexión desplazada se le manda session.replaced y se la cierra con 4001.</summary>
    public async Task ReplaceAndCloseAsync(CancellationToken ct)
    {
        try
        {
            var json = MessageCodec.Serialize(MessageTypes.SessionReplaced, new SessionReplacedPayload { Reason = "NEW_CONNECTION" });
            await SendAsync(json, ct).ConfigureAwait(false);
        }
        catch
        {
            // best-effort: si ya no se puede escribir, igual seguimos al cierre.
        }

        await CloseAsync(CloseCodes.SessionReplaced, "replaced", ct).ConfigureAwait(false);
    }

    public async Task CloseAsync(int closeCode, string reason, CancellationToken ct)
    {
        if (Socket.State is not (WebSocketState.Open or WebSocketState.CloseReceived))
        {
            return;
        }

        try
        {
            await Socket.CloseAsync((WebSocketCloseStatus)closeCode, reason, ct).ConfigureAwait(false);
        }
        catch
        {
            // el socket puede haber muerto de la otra punta; no es un error operable acá.
        }
    }
}
