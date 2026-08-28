using System.Buffers.Binary;

namespace Pulso.Agent.Sensors.WbfFingerJetSensor;

public static class Ansi381FingerprintParser
{
    private const int HeaderSize = 40;
    private const int RecordSize = 16;
    private const uint FormatIdentifier = 0x46495200;

    public static FingerprintImageSample Parse(ReadOnlySpan<byte> standardDataBlock)
    {
        if (standardDataBlock.Length < HeaderSize + RecordSize)
        {
            throw new InvalidDataException("La muestra ANSI-381 está incompleta.");
        }

        var declaredLength = BinaryPrimitives.ReadUInt64LittleEndian(standardDataBlock[..8]);
        var format = BinaryPrimitives.ReadUInt32LittleEndian(standardDataBlock.Slice(8, 4));
        if (format != FormatIdentifier)
        {
            throw new InvalidDataException("Windows devolvió un formato biométrico distinto de ANSI-381.");
        }

        if (declaredLength > (ulong)standardDataBlock.Length)
        {
            throw new InvalidDataException("La longitud declarada de la muestra ANSI-381 es inválida.");
        }

        var elementCount = standardDataBlock[32];
        var scaleUnits = standardDataBlock[33];
        var pixelDepth = standardDataBlock[34];
        var compression = standardDataBlock[35];
        if (elementCount == 0)
        {
            throw new InvalidDataException("La muestra ANSI-381 no contiene una huella.");
        }

        if (pixelDepth != 8)
        {
            throw new InvalidDataException($"Profundidad de píxel ANSI-381 no soportada: {pixelDepth}.");
        }

        if (compression != 0)
        {
            throw new InvalidDataException($"La compresión ANSI-381 ({compression}) todavía no está soportada.");
        }

        var record = standardDataBlock[HeaderSize..];
        var blockLength = BinaryPrimitives.ReadUInt32LittleEndian(record[..4]);
        var width = BinaryPrimitives.ReadUInt16LittleEndian(record.Slice(4, 2));
        var height = BinaryPrimitives.ReadUInt16LittleEndian(record.Slice(6, 2));
        var expectedPixels = checked((int)width * height);
        if (blockLength < RecordSize || blockLength > record.Length || blockLength - RecordSize != expectedPixels)
        {
            throw new InvalidDataException("El registro de imagen ANSI-381 tiene una longitud inválida.");
        }

        var resolution = BinaryPrimitives.ReadUInt16LittleEndian(standardDataBlock.Slice(28, 2));
        var dpi = scaleUnits switch
        {
            1 when resolution > 0 => resolution,
            2 when resolution > 0 => (int)Math.Round(resolution * 2.54),
            _ => 500,
        };

        return new FingerprintImageSample(width, height, dpi, record.Slice(RecordSize, expectedPixels).ToArray());
    }
}
