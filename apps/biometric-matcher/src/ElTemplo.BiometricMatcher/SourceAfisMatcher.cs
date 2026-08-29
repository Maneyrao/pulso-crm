using SourceAFIS;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace ElTemplo.BiometricMatcher;

public sealed record MatchCandidate(string CredentialId, string MemberId, byte[] Template);
public sealed record MatchScore(string CredentialId, string MemberId, double Score);
public sealed record ExtractedTemplate(byte[] Template, int Quality);

public static class SourceAfisMatcher
{
    public static ExtractedTemplate ExtractPng(byte[] png)
    {
        using var decoded = Image.Load<L8>(png);
        var pixels = new byte[decoded.Width * decoded.Height];
        var offset = 0;
        decoded.ProcessPixelRows(rows =>
        {
            for (var y = 0; y < decoded.Height; y++)
            {
                var row = rows.GetRowSpan(y);
                for (var x = 0; x < decoded.Width; x++)
                {
                    pixels[offset++] = row[x].PackedValue;
                }
            }
        });

        try
        {
            var image = new FingerprintImage(
                decoded.Width,
                decoded.Height,
                pixels,
                new FingerprintImageOptions { Dpi = 500 });
            var template = new FingerprintTemplate(image).ToByteArray();
            return new ExtractedTemplate(template, EstimateQuality(pixels));
        }
        finally
        {
            Array.Clear(pixels);
        }
    }

    public static IReadOnlyList<MatchScore> Match(byte[] probe, IReadOnlyList<MatchCandidate> candidates)
    {
        var matcher = new FingerprintMatcher(new FingerprintTemplate(probe));
        return candidates.Select(candidate =>
        {
            var rawScore = matcher.Match(new FingerprintTemplate(candidate.Template));
            var boundedScore = Math.Round(Math.Clamp(rawScore, 0, 100), 2);
            return new MatchScore(candidate.CredentialId, candidate.MemberId, boundedScore);
        }).ToArray();
    }

    private static int EstimateQuality(byte[] pixels)
    {
        var mean = pixels.Average(value => (double)value);
        var variance = pixels.Average(value => Math.Pow(value - mean, 2));
        var contrast = Math.Sqrt(variance);
        var exposurePenalty = Math.Abs(mean - 127.5) / 127.5;
        return (int)Math.Round(Math.Clamp((contrast - 5) * 2 * (1 - exposurePenalty * 0.35), 0, 100));
    }
}
