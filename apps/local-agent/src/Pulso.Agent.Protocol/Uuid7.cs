using System.Security.Cryptography;

namespace Pulso.Agent.Protocol;

/// <summary>
/// Generador de UUID v7 (RFC 9562) para .NET 8, donde <c>Guid.CreateVersion7</c> todavía no existe
/// (llegó en .NET 9). 48 bits de timestamp en ms + 74 bits aleatorios, versión y variant seteados.
/// </summary>
public static class Uuid7
{
    public static Guid NewGuid()
    {
        Span<byte> bytes = stackalloc byte[16];
        RandomNumberGenerator.Fill(bytes);

        var unixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        bytes[0] = (byte)(unixMs >> 40);
        bytes[1] = (byte)(unixMs >> 32);
        bytes[2] = (byte)(unixMs >> 24);
        bytes[3] = (byte)(unixMs >> 16);
        bytes[4] = (byte)(unixMs >> 8);
        bytes[5] = (byte)unixMs;

        // Versión 7 en los 4 bits altos del byte 6.
        bytes[6] = (byte)((bytes[6] & 0x0F) | 0x70);
        // Variant RFC 9562 (10xx xxxx) en los 2 bits altos del byte 8.
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80);

        return new Guid(bytes, bigEndian: true);
    }
}
