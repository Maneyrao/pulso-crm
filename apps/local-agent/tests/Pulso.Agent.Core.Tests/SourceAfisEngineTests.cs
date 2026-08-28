using Pulso.Agent.Sensors.WbfFingerJetSensor;

namespace Pulso.Agent.Core.Tests;

public sealed class SourceAfisEngineTests
{
    [Fact]
    public void Extract_produces_non_image_template_and_same_template_matches()
    {
        var pixels = BuildFingerprintLikeImage(width: 96, height: 112);
        var image = new FingerprintImageSample(96, 112, 500, pixels);

        var template = SourceAfisEngine.Extract(image);
        var score = SourceAfisEngine.Match(template, template);

        Assert.NotEmpty(template);
        Assert.False(template.AsSpan().SequenceEqual(pixels));
        Assert.True(score > 0, $"Score esperado > 0, obtenido {score}.");
    }

    private static byte[] BuildFingerprintLikeImage(int width, int height)
    {
        var pixels = new byte[width * height];
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var dx = x - width / 2.0;
                var dy = y - height / 2.0;
                var radius = Math.Sqrt(dx * dx + dy * dy);
                var angle = Math.Atan2(dy, dx);
                var ridges = Math.Sin(radius * 0.72 + Math.Sin(angle * 2) * 3.5);
                var vignette = Math.Clamp(1 - radius / (Math.Min(width, height) * 0.58), 0, 1);
                var value = 245 - (int)(155 * ((ridges + 1) / 2) * vignette);
                pixels[y * width + x] = (byte)Math.Clamp(value, 0, 255);
            }
        }

        return pixels;
    }
}
