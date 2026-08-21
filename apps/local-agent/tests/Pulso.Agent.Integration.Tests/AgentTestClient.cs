using System.Net.WebSockets;
using System.Text;
using Pulso.Agent.Protocol;

namespace Pulso.Agent.Integration.Tests;

/// <summary>Cliente WS mínimo que reusa MessageCodec (mismo contrato que valida Protocol.Tests).</summary>
public sealed class AgentTestClient(WebSocket socket)
{
    public async Task SendAsync<TPayload>(string type, TPayload? payload, string? correlationId = null, string? id = null)
    {
        var json = MessageCodec.Serialize(type, payload, correlationId, id);
        var bytes = Encoding.UTF8.GetBytes(json);
        await socket.SendAsync(bytes, WebSocketMessageType.Text, endOfMessage: true, CancellationToken.None).ConfigureAwait(false);
    }

    public async Task SendRawAsync(string json)
    {
        var bytes = Encoding.UTF8.GetBytes(json);
        await socket.SendAsync(bytes, WebSocketMessageType.Text, endOfMessage: true, CancellationToken.None).ConfigureAwait(false);
    }

    public async Task<ParsedMessage> ReceiveAsync(TimeSpan? timeout = null)
    {
        using var stream = new MemoryStream();
        var buffer = new byte[65536];
        using var cts = new CancellationTokenSource(timeout ?? TimeSpan.FromSeconds(5));

        WebSocketReceiveResult result;
        do
        {
            result = await socket.ReceiveAsync(buffer, cts.Token).ConfigureAwait(false);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                throw new InvalidOperationException($"El socket se cerró: {result.CloseStatus} {result.CloseStatusDescription}");
            }

            stream.Write(buffer, 0, result.Count);
        }
        while (!result.EndOfMessage);

        var text = Encoding.UTF8.GetString(stream.ToArray());
        var parsed = MessageCodec.TryParse(text);
        if (!parsed.Success)
        {
            throw new InvalidOperationException($"No se pudo parsear la respuesta ({parsed.Error?.Code}: {parsed.Error?.Detail}): {text}");
        }

        return parsed.Message!;
    }

    /// <summary>Descarta mensajes hasta encontrar uno del tipo pedido, o falla por timeout.</summary>
    public async Task<ParsedMessage> ReceiveUntilAsync(string type, TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(10));
        while (true)
        {
            var remaining = deadline - DateTime.UtcNow;
            if (remaining <= TimeSpan.Zero)
            {
                throw new TimeoutException($"No llegó un mensaje de tipo '{type}' a tiempo.");
            }

            var message = await ReceiveAsync(remaining).ConfigureAwait(false);
            if (message.Envelope.Type == type)
            {
                return message;
            }
        }
    }
}
