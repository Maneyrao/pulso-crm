namespace Pulso.Agent.Protocol;

/// <summary>Mensaje ya parseado y validado, con el payload tipado resuelto según "type".</summary>
public sealed class ParsedMessage
{
    public required RawEnvelope Envelope { get; init; }

    /// <summary>Instancia tipada del payload (p.ej. HelloPayload), o null para tipos sin payload.</summary>
    public object? TypedPayload { get; init; }
}

public sealed class ProtocolError
{
    public required string Code { get; init; }
    public required string Detail { get; init; }
}

/// <summary>Resultado de intentar parsear un mensaje crudo del WS local.</summary>
public sealed class ParseResult
{
    public required bool Success { get; init; }
    public ParsedMessage? Message { get; init; }
    public ProtocolError? Error { get; init; }

    /// <summary>Si es true, el servidor debe cerrar la conexión con CloseCode.</summary>
    public bool ShouldClose { get; init; }
    public int? CloseCode { get; init; }

    public static ParseResult Ok(ParsedMessage message) => new() { Success = true, Message = message };

    public static ParseResult Fail(string code, string detail, bool shouldClose = false, int? closeCode = null) =>
        new()
        {
            Success = false,
            Error = new ProtocolError { Code = code, Detail = detail },
            ShouldClose = shouldClose,
            CloseCode = closeCode,
        };
}
