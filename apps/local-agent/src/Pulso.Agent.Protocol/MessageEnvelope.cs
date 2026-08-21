using System.Text.Json;
using System.Text.Json.Serialization;

namespace Pulso.Agent.Protocol;

/// <summary>
/// Sobre de mensaje a nivel de cable (WEBSOCKET_PROTOCOL.md §5): { v, id, type, ts, correlationId, payload }.
/// El payload se mantiene como JsonElement crudo hasta que se resuelve el tipo concreto según "type".
/// </summary>
public sealed class RawEnvelope
{
    [JsonPropertyName("v")]
    public required string V { get; init; }

    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("ts")]
    public required DateTimeOffset Ts { get; init; }

    [JsonPropertyName("correlationId")]
    public string? CorrelationId { get; init; }

    [JsonPropertyName("payload")]
    public JsonElement? Payload { get; init; }
}

/// <summary>Sobre tipado, usado para serializar mensajes salientes o para consumo ya validado.</summary>
public sealed class Envelope<TPayload>
{
    [JsonPropertyName("v")]
    public string V { get; init; } = ProtocolConstants.Version;

    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("ts")]
    public DateTimeOffset Ts { get; init; } = DateTimeOffset.Now;

    [JsonPropertyName("correlationId")]
    public string? CorrelationId { get; init; }

    [JsonPropertyName("payload")]
    public TPayload? Payload { get; init; }
}

public static class ProtocolJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        NumberHandling = JsonNumberHandling.Strict,
    };
}
