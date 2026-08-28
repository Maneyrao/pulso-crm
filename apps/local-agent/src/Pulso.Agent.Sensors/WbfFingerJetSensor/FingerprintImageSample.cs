using System.Buffers.Binary;
using System.Text;

namespace Pulso.Agent.Sensors.WbfFingerJetSensor;

public sealed record FingerprintImageSample(int Width, int Height, int Dpi, byte[] Pixels);

public static class FingerprintImageSampleCodec
{
    private static readonly byte[] Magic = Encoding.ASCII.GetBytes("ETFPIMG1");
    private const int HeaderSize = 24;

    public static byte[] Encode(FingerprintImageSample image)
    {
        Validate(image);
        var encoded = new byte[HeaderSize + image.Pixels.Length];
        Magic.CopyTo(encoded, 0);
        BinaryPrimitives.WriteInt32LittleEndian(encoded.AsSpan(8, 4), image.Width);
        BinaryPrimitives.WriteInt32LittleEndian(encoded.AsSpan(12, 4), image.Height);
        BinaryPrimitives.WriteInt32LittleEndian(encoded.AsSpan(16, 4), image.Dpi);
        BinaryPrimitives.WriteInt32LittleEndian(encoded.AsSpan(20, 4), image.Pixels.Length);
        image.Pixels.CopyTo(encoded, HeaderSize);
        return encoded;
    }

    public static FingerprintImageSample Decode(ReadOnlySpan<byte> encoded)
    {
        if (encoded.Length < HeaderSize || !encoded[..Magic.Length].SequenceEqual(Magic))
        {
            throw new InvalidDataException("La captura no tiene el formato interno de El Templo Agent.");
        }

        var width = BinaryPrimitives.ReadInt32LittleEndian(encoded.Slice(8, 4));
        var height = BinaryPrimitives.ReadInt32LittleEndian(encoded.Slice(12, 4));
        var dpi = BinaryPrimitives.ReadInt32LittleEndian(encoded.Slice(16, 4));
        var length = BinaryPrimitives.ReadInt32LittleEndian(encoded.Slice(20, 4));
        if (length < 0 || encoded.Length != HeaderSize + length)
        {
            throw new InvalidDataException("La longitud de la captura biométrica es inválida.");
        }

        var image = new FingerprintImageSample(width, height, dpi, encoded[HeaderSize..].ToArray());
        Validate(image);
        return image;
    }

    private static void Validate(FingerprintImageSample image)
    {
        if (image.Width <= 0 || image.Height <= 0 || image.Width > 4096 || image.Height > 4096)
        {
            throw new InvalidDataException("Las dimensiones de la captura biométrica son inválidas.");
        }

        if (image.Dpi is < 100 or > 2000)
        {
            throw new InvalidDataException("La resolución de la captura biométrica es inválida.");
        }

        if ((long)image.Width * image.Height != image.Pixels.Length)
        {
            throw new InvalidDataException("La captura no contiene exactamente un byte por píxel.");
        }
    }
}
