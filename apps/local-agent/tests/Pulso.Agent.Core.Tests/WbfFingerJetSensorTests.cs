using System.Buffers.Binary;
using Pulso.Agent.Sensors;
using Pulso.Agent.Sensors.WbfFingerJetSensor;

namespace Pulso.Agent.Core.Tests;

public sealed class WbfFingerJetSensorTests
{
    [Fact]
    public async Task Enumerate_maps_Windows_biometric_units()
    {
        var api = new StubWindowsBiometricApi
        {
            Units =
            [
                new WindowsBiometricUnit(7, "USB\\VID_05BA&PID_000A", "U.are.U 4500", "HID", "U.are.U 4500", "SER-1"),
            ],
        };
        var sensor = new WbfFingerJetSensor(api);

        var devices = await sensor.EnumerateAsync(CancellationToken.None);

        var device = Assert.Single(devices);
        Assert.Equal("WBF-7", device.SensorId);
        Assert.Equal("HID", device.Vendor);
        Assert.Equal("U.are.U 4500", device.Model);
        Assert.Equal(SensorStatus.Online, device.Status);
    }

    [Fact]
    public async Task Capture_encodes_raw_ANSI_381_image_and_quality_distinguishes_contrast()
    {
        var api = new StubWindowsBiometricApi { Units = [Unit()] };
        var sensor = new WbfFingerJetSensor(api);
        api.NextCapture = new CapturedAnsi381Sample(7, BuildAnsi381Block(32, 24, [.. Enumerable.Repeat((byte)128, 768)]));

        var flat = await sensor.CaptureAsync("WBF-7", TimeSpan.FromSeconds(1), CancellationToken.None);

        api.NextCapture = new CapturedAnsi381Sample(7, BuildAnsi381Block(32, 24, BuildAlternatingPixels(768)));
        var contrasted = await sensor.CaptureAsync("WBF-7", TimeSpan.FromSeconds(1), CancellationToken.None);

        Assert.True(sensor.EvaluateQuality(contrasted).Value > sensor.EvaluateQuality(flat).Value);
        Assert.Equal(32, FingerprintImageSampleCodec.Decode(contrasted.ImageData).Width);
        flat.Wipe();
        contrasted.Wipe();
    }

    [Fact]
    public async Task CreateTemplate_extracts_SourceAfis_native_template()
    {
        var api = new StubWindowsBiometricApi { Units = [Unit()] };
        var sensor = new WbfFingerJetSensor(api);
        api.NextCapture = new CapturedAnsi381Sample(7, BuildAnsi381Block(96, 112, BuildFingerprintLikePixels(96, 112)));
        var sample = await sensor.CaptureAsync("WBF-7", TimeSpan.FromSeconds(1), CancellationToken.None);

        var template = await sensor.CreateTemplateAsync(
            [sample],
            TemplateFormat.SourceAfisNative,
            CancellationToken.None);

        Assert.Equal(TemplateFormat.SourceAfisNative, template.Format);
        Assert.NotEmpty(template.TemplateData);
        Assert.InRange(template.Quality, 0, 100);
        sample.Wipe();
        template.Wipe();
    }

    [Fact]
    public async Task Capture_rejects_unknown_sensor_id()
    {
        var sensor = new WbfFingerJetSensor(new StubWindowsBiometricApi { Units = [Unit()] });

        await Assert.ThrowsAsync<SensorNotFoundException>(() =>
            sensor.CaptureAsync("WBF-999", TimeSpan.FromSeconds(1), CancellationToken.None));
    }

    private static WindowsBiometricUnit Unit() =>
        new(7, "USB\\VID_05BA&PID_000A", "U.are.U 4500", "HID", "U.are.U 4500", "SER-1");

    private static byte[] BuildAlternatingPixels(int count) =>
        Enumerable.Range(0, count).Select(index => index % 2 == 0 ? (byte)20 : (byte)235).ToArray();

    private static byte[] BuildFingerprintLikePixels(int width, int height)
    {
        var pixels = new byte[width * height];
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var dx = x - width / 2.0;
                var dy = y - height / 2.0;
                var radius = Math.Sqrt(dx * dx + dy * dy);
                var ridges = Math.Sin(radius * 0.72 + Math.Sin(Math.Atan2(dy, dx) * 2) * 3.5);
                pixels[y * width + x] = (byte)Math.Clamp(170 + 70 * ridges, 0, 255);
            }
        }

        return pixels;
    }

    private static byte[] BuildAnsi381Block(int width, int height, byte[] pixels)
    {
        const int headerSize = 40;
        const int recordSize = 16;
        var result = new byte[headerSize + recordSize + pixels.Length];
        var span = result.AsSpan();
        BinaryPrimitives.WriteUInt64LittleEndian(span[0..8], (ulong)result.Length);
        BinaryPrimitives.WriteUInt32LittleEndian(span[8..12], 0x46495200);
        BinaryPrimitives.WriteUInt32LittleEndian(span[12..16], 0x30313000);
        BinaryPrimitives.WriteUInt16LittleEndian(span[28..30], 500);
        BinaryPrimitives.WriteUInt16LittleEndian(span[30..32], 500);
        span[32] = 1;
        span[33] = 1;
        span[34] = 8;
        span[35] = 0;
        var record = span[headerSize..];
        BinaryPrimitives.WriteUInt32LittleEndian(record[0..4], (uint)(recordSize + pixels.Length));
        BinaryPrimitives.WriteUInt16LittleEndian(record[4..6], (ushort)width);
        BinaryPrimitives.WriteUInt16LittleEndian(record[6..8], (ushort)height);
        record[9] = 1;
        record[10] = 1;
        record[11] = 80;
        pixels.CopyTo(record[recordSize..]);
        return result;
    }

    private sealed class StubWindowsBiometricApi : IWindowsBiometricApi
    {
        public IReadOnlyList<WindowsBiometricUnit> Units { get; init; } = [];

        public CapturedAnsi381Sample? NextCapture { get; set; }

        public Task<IReadOnlyList<WindowsBiometricUnit>> EnumerateAsync(CancellationToken ct) =>
            Task.FromResult(Units);

        public Task<CapturedAnsi381Sample> CaptureAsync(uint unitId, TimeSpan timeout, CancellationToken ct) =>
            Task.FromResult(NextCapture ?? throw new InvalidOperationException("No capture configured."));
    }
}
