using SourceAFIS;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace ElTemplo.BiometricMatcher.Tests;

public sealed class SourceAfisMatcherTests
{
    [Fact]
    public void Match_returns_candidate_identity_and_a_bounded_score()
    {
        var template = BuildTemplate();

        var scores = SourceAfisMatcher.Match(
            template,
            [new MatchCandidate("credential-1", "member-1", template)]);

        var score = Assert.Single(scores);
        Assert.Equal("credential-1", score.CredentialId);
        Assert.Equal("member-1", score.MemberId);
        Assert.InRange(score.Score, 0, 100);
        Assert.True(score.Score > 0);
    }

    [Fact]
    public void ExtractPng_returns_a_native_template_without_persisting_the_image()
    {
        var png = BuildPng();

        var extracted = SourceAfisMatcher.ExtractPng(png);

        Assert.NotEmpty(extracted.Template);
        Assert.InRange(extracted.Quality, 0, 100);
        Assert.NotEqual(png, extracted.Template);
        _ = new FingerprintTemplate(extracted.Template);
    }

    private static byte[] BuildTemplate()
    {
        const int width = 96;
        const int height = 112;
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

        var image = new FingerprintImage(width, height, pixels, new FingerprintImageOptions { Dpi = 500 });
        return new FingerprintTemplate(image).ToByteArray();
    }

    private static byte[] BuildPng()
    {
        const int width = 96;
        const int height = 112;
        using var image = new Image<L8>(width, height);
        image.ProcessPixelRows(rows =>
        {
            for (var y = 0; y < height; y++)
            {
                var row = rows.GetRowSpan(y);
                for (var x = 0; x < width; x++)
                {
                    var radius = Math.Sqrt(Math.Pow(x - width / 2.0, 2) + Math.Pow(y - height / 2.0, 2));
                    row[x] = new L8((byte)Math.Clamp(170 + 70 * Math.Sin(radius * 0.72), 0, 255));
                }
            }
        });
        using var stream = new MemoryStream();
        image.SaveAsPng(stream);
        return stream.ToArray();
    }
}
