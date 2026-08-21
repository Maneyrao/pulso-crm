using System.Text.Json;
using Xunit;

namespace Pulso.Agent.Protocol.Tests;

/// <summary>
/// Consume docs/biometrics/protocol-fixtures/*.json — un archivo por tipo de mensaje con
/// { "valid": [...], "invalid": [...] } — y verifica que MessageCodec acepte lo válido y
/// rechace lo inválido. Es el lado .NET del mecanismo de sincronización descrito en
/// WEBSOCKET_PROTOCOL.md §11: el mismo fixture tiene un test espejo en TypeScript.
/// </summary>
public class ProtocolFixturesTests
{
    public static IEnumerable<object[]> ValidCases() => Cases("valid");

    public static IEnumerable<object[]> InvalidCases() => Cases("invalid");

    private static IEnumerable<object[]> Cases(string bucket)
    {
        var dir = FixturesLocator.Directory();
        var files = System.IO.Directory.GetFiles(dir, "*.json").OrderBy(f => f, StringComparer.Ordinal);

        foreach (var file in files)
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(file));
            if (!doc.RootElement.TryGetProperty(bucket, out var array))
            {
                continue;
            }

            var index = 0;
            foreach (var item in array.EnumerateArray())
            {
                yield return new object[] { Path.GetFileName(file), index, item.GetRawText() };
                index++;
            }
        }
    }

    [Fact]
    public void Fixture_directory_has_one_file_per_message_type()
    {
        var dir = FixturesLocator.Directory();
        var files = System.IO.Directory.GetFiles(dir, "*.json").Select(Path.GetFileNameWithoutExtension).ToHashSet();

        foreach (var type in MessageTypes.All)
        {
            Assert.True(files.Contains(type), $"Falta docs/biometrics/protocol-fixtures/{type}.json");
        }
    }

    [Theory]
    [MemberData(nameof(ValidCases))]
    public void Valid_fixture_parses_successfully(string file, int index, string json)
    {
        var result = MessageCodec.TryParse(json);

        Assert.True(
            result.Success,
            $"{file}[valid][{index}] debería parsear OK pero falló con {result.Error?.Code}: {result.Error?.Detail}");
        Assert.NotNull(result.Message);
    }

    [Theory]
    [MemberData(nameof(InvalidCases))]
    public void Invalid_fixture_is_rejected(string file, int index, string json)
    {
        var result = MessageCodec.TryParse(json);

        Assert.False(result.Success, $"{file}[invalid][{index}] debería fallar pero fue aceptado.");
        Assert.NotNull(result.Error);
    }
}
