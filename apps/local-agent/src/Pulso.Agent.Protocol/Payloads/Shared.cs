using System.Text.Json.Serialization;

namespace Pulso.Agent.Protocol.Payloads;

/// <summary>Entrada de dispositivo tal como aparece en hello.ack/status.devices[] (§6.2).</summary>
public sealed record DeviceInfo
{
    [JsonPropertyName("deviceId")]
    public required string DeviceId { get; init; }

    [JsonPropertyName("kind")]
    public required string Kind { get; init; }

    [JsonPropertyName("vendor")]
    public required string Vendor { get; init; }

    [JsonPropertyName("model")]
    public required string Model { get; init; }

    [JsonPropertyName("serialNumber")]
    public string? SerialNumber { get; init; }

    [JsonPropertyName("status")]
    public required string Status { get; init; }
}
