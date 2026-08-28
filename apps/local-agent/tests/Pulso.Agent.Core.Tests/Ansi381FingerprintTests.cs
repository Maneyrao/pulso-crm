using System.Buffers.Binary;
using Pulso.Agent.Sensors.WbfFingerJetSensor;

namespace Pulso.Agent.Core.Tests;

public sealed class Ansi381FingerprintTests
{
    [Fact]
    public void Parse_reads_uncompressed_8_bit_fingerprint_image()
    {
        var pixels = Enumerable.Range(0, 12).Select(value => (byte)(value * 17)).ToArray();
        var block = BuildAnsi381Block(width: 4, height: 3, pixels, scaleUnits: 2, resolution: 197);

        var image = Ansi381FingerprintParser.Parse(block);

        Assert.Equal(4, image.Width);
        Assert.Equal(3, image.Height);
        Assert.Equal(500, image.Dpi);
        Assert.Equal(pixels, image.Pixels);
    }

    [Fact]
    public void Parse_rejects_compressed_samples_instead_of_misreading_them()
    {
        var block = BuildAnsi381Block(width: 2, height: 2, [1, 2, 3, 4], compression: 1);

        var error = Assert.Throws<InvalidDataException>(() => Ansi381FingerprintParser.Parse(block));

        Assert.Contains("compresi", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Image_codec_round_trips_capture_metadata_and_pixels()
    {
        var original = new FingerprintImageSample(3, 2, 512, [0, 25, 50, 100, 175, 255]);

        var decoded = FingerprintImageSampleCodec.Decode(FingerprintImageSampleCodec.Encode(original));

        Assert.Equal(original.Width, decoded.Width);
        Assert.Equal(original.Height, decoded.Height);
        Assert.Equal(original.Dpi, decoded.Dpi);
        Assert.Equal(original.Pixels, decoded.Pixels);
    }

    private static byte[] BuildAnsi381Block(
        int width,
        int height,
        byte[] pixels,
        byte scaleUnits = 1,
        ushort resolution = 500,
        byte compression = 0)
    {
        const int headerSize = 40;
        const int recordSize = 16;
        var result = new byte[headerSize + recordSize + pixels.Length];
        var span = result.AsSpan();

        BinaryPrimitives.WriteUInt64LittleEndian(span[0..8], (ulong)result.Length);
        BinaryPrimitives.WriteUInt32LittleEndian(span[8..12], 0x46495200);
        BinaryPrimitives.WriteUInt32LittleEndian(span[12..16], 0x30313000);
        BinaryPrimitives.WriteUInt16LittleEndian(span[28..30], resolution);
        BinaryPrimitives.WriteUInt16LittleEndian(span[30..32], resolution);
        span[32] = 1;
        span[33] = scaleUnits;
        span[34] = 8;
        span[35] = compression;

        var record = span[headerSize..];
        BinaryPrimitives.WriteUInt32LittleEndian(record[0..4], (uint)(recordSize + pixels.Length));
        BinaryPrimitives.WriteUInt16LittleEndian(record[4..6], (ushort)width);
        BinaryPrimitives.WriteUInt16LittleEndian(record[6..8], (ushort)height);
        record[9] = 1;
        record[10] = 1;
        record[11] = 0xfe;
        pixels.CopyTo(record[recordSize..]);
        return result;
    }
}
