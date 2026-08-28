using SourceAFIS;
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
}
