using System.Text;
using Xunit;

namespace Pulso.Agent.Protocol.Tests;

/// <summary>Reglas de sobre que no son "un tipo de mensaje" sino comportamiento transversal (§5, §7, §8).</summary>
public class EnvelopeRulesTests
{
    [Fact]
    public void Unknown_type_does_not_request_a_close_and_reports_UNKNOWN_MESSAGE_TYPE()
    {
        var json = """
            { "v": "1.0", "id": "1", "type": "totally.unknown", "ts": "2026-08-09T14:30:00-03:00" }
            """;

        var result = MessageCodec.TryParse(json);

        Assert.False(result.Success);
        Assert.Equal(ErrorCodes.UnknownMessageType, result.Error!.Code);
        Assert.False(result.ShouldClose, "un tipo desconocido no debe cerrar la conexión (§5)");
    }

    [Fact]
    public void Unknown_field_in_known_payload_is_ignored()
    {
        var json = """
            { "v": "1.0", "id": "1", "type": "identify.stop", "ts": "2026-08-09T14:30:00-03:00",
              "payload": { "opId": "abc", "somethingFromTheFuture": 123 } }
            """;

        var result = MessageCodec.TryParse(json);

        Assert.True(result.Success, result.Error?.Detail);
    }

    [Fact]
    public void Message_over_256KB_is_rejected_and_requests_close_4009()
    {
        var padding = new string('a', 260 * 1024);
        var json = $$"""
            { "v": "1.0", "id": "1", "type": "identify.stop", "ts": "2026-08-09T14:30:00-03:00",
              "payload": { "opId": "{{padding}}" } }
            """;

        var result = MessageCodec.TryParse(json);

        Assert.False(result.Success);
        Assert.True(result.ShouldClose);
        Assert.Equal(CloseCodes.MessageTooLarge, result.CloseCode);
    }

    [Fact]
    public void Message_under_256KB_is_not_rejected_for_size()
    {
        var json = """{ "v": "1.0", "id": "1", "type": "ping", "ts": "2026-08-09T14:30:00-03:00" }""";
        Assert.True(Encoding.UTF8.GetByteCount(json) < ProtocolConstants.MaxMessageSizeBytes);

        var result = MessageCodec.TryParse(json);

        Assert.True(result.Success);
    }

    [Fact]
    public void Incompatible_major_version_requests_close_4010()
    {
        var json = """{ "v": "2.0", "id": "1", "type": "ping", "ts": "2026-08-09T14:30:00-03:00" }""";

        var result = MessageCodec.TryParse(json);

        Assert.False(result.Success);
        Assert.Equal(ErrorCodes.ProtocolVersionUnsupported, result.Error!.Code);
        Assert.True(result.ShouldClose);
        Assert.Equal(CloseCodes.ProtocolVersionIncompatible, result.CloseCode);
    }

    [Fact]
    public void Minor_version_mismatch_is_still_accepted()
    {
        // 1.1 -> el agente 1.0 la sirve igual: sólo el mayor es incompatible (§5 Versionado).
        var json = """{ "v": "1.1", "id": "1", "type": "ping", "ts": "2026-08-09T14:30:00-03:00" }""";

        var result = MessageCodec.TryParse(json);

        Assert.True(result.Success);
    }

    [Fact]
    public void Serialize_roundtrips_through_TryParse()
    {
        var payload = new Payloads.IdentifyStopPayload { OpId = "op-1" };
        var json = MessageCodec.Serialize(MessageTypes.IdentifyStop, payload, correlationId: "corr-1");

        var result = MessageCodec.TryParse(json);

        Assert.True(result.Success);
        var typed = Assert.IsType<Payloads.IdentifyStopPayload>(result.Message!.TypedPayload);
        Assert.Equal("op-1", typed.OpId);
        Assert.Equal("corr-1", result.Message.Envelope.CorrelationId);
        Assert.Equal(ProtocolConstants.Version, result.Message.Envelope.V);
    }
}
