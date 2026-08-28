using SourceAFIS;

namespace ElTemplo.BiometricMatcher;

public sealed record MatchCandidate(string CredentialId, string MemberId, byte[] Template);
public sealed record MatchScore(string CredentialId, string MemberId, double Score);

public static class SourceAfisMatcher
{
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
}
