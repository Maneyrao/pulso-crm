using System.Security.Cryptography;
using System.Text;
using ElTemplo.BiometricMatcher;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 32 * 1024 * 1024);
var app = builder.Build();

var expectedToken = Environment.GetEnvironmentVariable("MATCHER_TOKEN");
if (string.IsNullOrWhiteSpace(expectedToken) || expectedToken.Length < 32)
{
    throw new InvalidOperationException("MATCHER_TOKEN debe tener al menos 32 caracteres.");
}

app.MapGet("/health", () => Results.Ok(new { status = "ok", engine = "sourceafis-3.14" }));

app.MapPost("/extract", (HttpContext context, ExtractHttpRequest request) =>
{
    if (!HasValidToken(context.Request.Headers.Authorization, expectedToken))
    {
        return Results.Unauthorized();
    }

    if (string.IsNullOrWhiteSpace(request.Image))
    {
        return Results.BadRequest(new { error = "Imagen inválida." });
    }

    byte[] image;
    try
    {
        image = Convert.FromBase64String(request.Image);
    }
    catch (FormatException)
    {
        return Results.BadRequest(new { error = "Imagen inválida." });
    }

    if (image.Length is 0 or > 512 * 1024)
    {
        CryptographicOperations.ZeroMemory(image);
        return Results.BadRequest(new { error = "Tamaño de imagen inválido." });
    }

    try
    {
        var extracted = SourceAfisMatcher.ExtractPng(image);
        var template = Convert.ToBase64String(extracted.Template);
        CryptographicOperations.ZeroMemory(extracted.Template);
        return Results.Ok(new { template, extracted.Quality });
    }
    catch (Exception exception) when (exception is ArgumentException or InvalidDataException or NotSupportedException)
    {
        return Results.BadRequest(new { error = "La muestra PNG no es válida." });
    }
    finally
    {
        CryptographicOperations.ZeroMemory(image);
    }
});

app.MapPost("/match", (HttpContext context, MatchHttpRequest request) =>
{
    if (!HasValidToken(context.Request.Headers.Authorization, expectedToken))
    {
        return Results.Unauthorized();
    }

    if (request.Candidates is null || request.Candidates.Count > 10_000)
    {
        return Results.BadRequest(new { error = "Cantidad de candidatos inválida." });
    }

    byte[] probe;
    try
    {
        probe = Convert.FromBase64String(request.Probe);
    }
    catch (FormatException)
    {
        return Results.BadRequest(new { error = "Probe inválida." });
    }

    var candidates = new List<MatchCandidate>(request.Candidates.Count);
    try
    {
        foreach (var candidate in request.Candidates)
        {
            candidates.Add(new MatchCandidate(
                candidate.CredentialId,
                candidate.MemberId,
                Convert.FromBase64String(candidate.Template)));
        }

        var scores = SourceAfisMatcher.Match(probe, candidates);
        return Results.Ok(new { scores });
    }
    catch (FormatException)
    {
        return Results.BadRequest(new { error = "Template candidata inválida." });
    }
    catch (Exception exception) when (exception is ArgumentException or InvalidDataException)
    {
        return Results.BadRequest(new { error = "Template SourceAFIS inválida." });
    }
    finally
    {
        CryptographicOperations.ZeroMemory(probe);
        foreach (var candidate in candidates)
        {
            CryptographicOperations.ZeroMemory(candidate.Template);
        }
    }
});

app.Run();

static bool HasValidToken(string? authorization, string expectedToken)
{
    const string prefix = "Bearer ";
    if (authorization is null || !authorization.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return false;
    var supplied = SHA256.HashData(Encoding.UTF8.GetBytes(authorization[prefix.Length..]));
    var expected = SHA256.HashData(Encoding.UTF8.GetBytes(expectedToken));
    return CryptographicOperations.FixedTimeEquals(supplied, expected);
}

public sealed record MatchHttpRequest(string Probe, List<MatchCandidateHttpRequest> Candidates);
public sealed record MatchCandidateHttpRequest(string CredentialId, string MemberId, string Template);
public sealed record ExtractHttpRequest(string Image);

public partial class Program;
