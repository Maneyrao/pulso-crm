using System.Net.WebSockets;
using System.Text;
using Pulso.Agent.Protocol;

namespace Pulso.Agent.Host.Ws;

public enum ReadOutcome
{
    Message,
    Closed,
    TooLarge,
}

public readonly record struct ReadResult(ReadOutcome Outcome, string? Text);

/// <summary>Lee un mensaje de texto completo (posiblemente fragmentado en varios frames) con tope de 256KB (§5).</summary>
public static class WebSocketMessageReader
{
    private const int ChunkSize = 8192;

    public static async Task<ReadResult> ReadTextMessageAsync(WebSocket socket, CancellationToken ct)
    {
        using var stream = new MemoryStream();
        var buffer = new byte[ChunkSize];
        WebSocketReceiveResult result;

        do
        {
            result = await socket.ReceiveAsync(buffer, ct).ConfigureAwait(false);

            if (result.MessageType == WebSocketMessageType.Close)
            {
                return new ReadResult(ReadOutcome.Closed, null);
            }

            stream.Write(buffer, 0, result.Count);
            if (stream.Length > ProtocolConstants.MaxMessageSizeBytes)
            {
                return new ReadResult(ReadOutcome.TooLarge, null);
            }
        }
        while (!result.EndOfMessage);

        return new ReadResult(ReadOutcome.Message, Encoding.UTF8.GetString(stream.ToArray()));
    }
}
