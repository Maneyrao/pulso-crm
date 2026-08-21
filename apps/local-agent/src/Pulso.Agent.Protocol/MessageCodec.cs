using System.Text;
using System.Text.Json;
using Pulso.Agent.Protocol.Payloads;

namespace Pulso.Agent.Protocol;

/// <summary>
/// Serializa y valida mensajes del protocolo WS local según WEBSOCKET_PROTOCOL.md §5-§8.
/// Es el único punto donde se decide si un mensaje entrante es válido.
/// </summary>
public static class MessageCodec
{
    /// <summary>Tipos de payload conocidos por "type". Los tipos ausentes de este mapa no llevan payload.</summary>
    private static readonly IReadOnlyDictionary<string, Type> PayloadTypes = new Dictionary<string, Type>
    {
        [MessageTypes.Hello] = typeof(HelloPayload),
        [MessageTypes.EnrollStart] = typeof(EnrollStartPayload),
        [MessageTypes.IdentifyStart] = typeof(IdentifyStartPayload),
        [MessageTypes.IdentifyStop] = typeof(IdentifyStopPayload),
        [MessageTypes.OperationCancel] = typeof(OperationCancelPayload),
        [MessageTypes.HelloAck] = typeof(HelloAckPayload),
        [MessageTypes.Status] = typeof(StatusPayload),
        [MessageTypes.DeviceConnected] = typeof(DeviceConnectedPayload),
        [MessageTypes.DeviceDisconnected] = typeof(DeviceDisconnectedPayload),
        [MessageTypes.EnrollProgress] = typeof(EnrollProgressPayload),
        [MessageTypes.EnrollCompleted] = typeof(EnrollCompletedPayload),
        [MessageTypes.EnrollFailed] = typeof(EnrollFailedPayload),
        [MessageTypes.IdentifyCaptured] = typeof(IdentifyCapturedPayload),
        [MessageTypes.IdentifySent] = typeof(IdentifySentPayload),
        [MessageTypes.IdentifyFailed] = typeof(IdentifyFailedPayload),
        [MessageTypes.OperationCancelled] = typeof(OperationCancelledPayload),
        [MessageTypes.SessionReplaced] = typeof(SessionReplacedPayload),
        [MessageTypes.Error] = typeof(ErrorPayload),
        // StatusGet, Ping, Pong: sin payload.
    };

    /// <summary>Parsea y valida un mensaje crudo recibido por el WS local.</summary>
    public static ParseResult TryParse(string rawJson)
    {
        ArgumentNullException.ThrowIfNull(rawJson);

        var sizeBytes = Encoding.UTF8.GetByteCount(rawJson);
        if (sizeBytes > ProtocolConstants.MaxMessageSizeBytes)
        {
            return ParseResult.Fail(
                ErrorCodes.InternalError,
                $"Mensaje de {sizeBytes} bytes excede el máximo de {ProtocolConstants.MaxMessageSizeBytes}.",
                shouldClose: true,
                closeCode: CloseCodes.MessageTooLarge);
        }

        RawEnvelope envelope;
        try
        {
            envelope = JsonSerializer.Deserialize<RawEnvelope>(rawJson, ProtocolJson.Options)
                       ?? throw new JsonException("Envelope nulo.");
        }
        catch (JsonException ex)
        {
            return ParseResult.Fail(ErrorCodes.MalformedEnvelope, ex.Message);
        }

        if (string.IsNullOrWhiteSpace(envelope.V) || string.IsNullOrWhiteSpace(envelope.Id) ||
            string.IsNullOrWhiteSpace(envelope.Type))
        {
            return ParseResult.Fail(ErrorCodes.MalformedEnvelope, "Faltan campos obligatorios del sobre (v, id, type, ts).");
        }

        if (ProtocolConstants.MajorOf(envelope.V) != ProtocolConstants.MajorVersion)
        {
            return ParseResult.Fail(
                ErrorCodes.ProtocolVersionUnsupported,
                $"Versión mayor '{envelope.V}' incompatible con '{ProtocolConstants.MajorVersion}.x'.",
                shouldClose: true,
                closeCode: CloseCodes.ProtocolVersionIncompatible);
        }

        if (!MessageTypes.All.Contains(envelope.Type))
        {
            // UNKNOWN_MESSAGE_TYPE: responder con error, NO cerrar la conexión (§5).
            return ParseResult.Fail(ErrorCodes.UnknownMessageType, $"Tipo de mensaje desconocido: '{envelope.Type}'.");
        }

        if (!PayloadTypes.TryGetValue(envelope.Type, out var payloadType))
        {
            // Tipos sin payload (status.get, ping, pong): válidos sin más validación.
            return ParseResult.Ok(new ParsedMessage { Envelope = envelope, TypedPayload = null });
        }

        if (envelope.Payload is null || envelope.Payload.Value.ValueKind == JsonValueKind.Undefined)
        {
            return ParseResult.Fail(ErrorCodes.InvalidPayload, $"El tipo '{envelope.Type}' requiere payload.");
        }

        try
        {
            var typed = envelope.Payload.Value.Deserialize(payloadType, ProtocolJson.Options);
            if (typed is null)
            {
                return ParseResult.Fail(ErrorCodes.InvalidPayload, $"Payload nulo para '{envelope.Type}'.");
            }

            return ParseResult.Ok(new ParsedMessage { Envelope = envelope, TypedPayload = typed });
        }
        catch (JsonException ex)
        {
            return ParseResult.Fail(ErrorCodes.InvalidPayload, ex.Message);
        }
    }

    /// <summary>Serializa un mensaje saliente con el sobre estándar.</summary>
    public static string Serialize<TPayload>(
        string type,
        TPayload? payload,
        string? correlationId = null,
        string? id = null)
    {
        var envelope = new Envelope<TPayload>
        {
            Id = id ?? Uuid7.NewGuid().ToString(),
            Type = type,
            CorrelationId = correlationId,
            Payload = payload,
        };
        return JsonSerializer.Serialize(envelope, ProtocolJson.Options);
    }
}
