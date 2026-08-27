using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Pulso.Agent.Integration.Tests;

/// <summary>
/// Levanta el Host real (Program.cs) contra un backend fake y un directorio de config temporal.
/// Program.cs lee agent.json/env vars ANTES de que exista el WebApplicationBuilder, así que las
/// variables de entorno se setean en el constructor, antes de tocar <see cref="WebApplicationFactory{TEntryPoint}.Server"/>.
/// TestServer reemplaza a Kestrel: los binds reales a 127.0.0.1:21987 no ocurren en estos tests.
/// </summary>
public sealed class PulsoAgentTestFactory : WebApplicationFactory<Program>
{
    private static readonly string[] EnvVars =
    [
        "PULSO_AGENT_HOME",
        "PULSO_AGENT_BACKEND_BASE_URL",
        "PULSO_AGENT_SENSOR",
        "PULSO_AGENT_DEV_CREDENTIAL",
        "PULSO_AGENT_INSTALLATION_ID",
        "PULSO_AGENT_PAIRING_SECRET",
        "PULSO_AGENT_TLS_ENABLED",
        "PULSO_AGENT_HTTP_RETRY_BASE_MS",
    ];

    private readonly string _homeDirectory;

    /// <param name="tlsEnabled">
    /// TestServer no negocia TLS real (no hay sockets), así que esto sólo mueve el flag de
    /// aplicación que gatea enroll/identify sobre ws sin TLS (WEBSOCKET_PROTOCOL.md §2). Default
    /// true para poder probar los flujos reales; los tests de gating lo ponen en false a propósito.
    /// </param>
    public PulsoAgentTestFactory(string backendBaseUrl, bool tlsEnabled = true, bool bootstrapPairing = false)
    {
        _homeDirectory = Path.Combine(Path.GetTempPath(), "pulso-agent-tests-" + Guid.NewGuid());
        Directory.CreateDirectory(_homeDirectory);

        Environment.SetEnvironmentVariable("PULSO_AGENT_HOME", _homeDirectory);
        Environment.SetEnvironmentVariable("PULSO_AGENT_BACKEND_BASE_URL", backendBaseUrl);
        Environment.SetEnvironmentVariable("PULSO_AGENT_SENSOR", "fake");
        Environment.SetEnvironmentVariable("PULSO_AGENT_DEV_CREDENTIAL", bootstrapPairing ? null : "test-credential");
        Environment.SetEnvironmentVariable(
            "PULSO_AGENT_INSTALLATION_ID",
            bootstrapPairing ? "00000000-0000-0000-0000-000000000123" : null);
        Environment.SetEnvironmentVariable("PULSO_AGENT_PAIRING_SECRET", bootstrapPairing ? "pas_test-secret" : null);
        Environment.SetEnvironmentVariable("PULSO_AGENT_TLS_ENABLED", tlsEnabled ? "true" : "false");
        // Backoff HTTP en ms (25 → 50/100/200ms): los 3 reintentos de la spec se ejercitan igual,
        // pero BACKEND_UNREACHABLE llega en <1s en vez de ~14s (ver ServiceCollectionExtensions).
        Environment.SetEnvironmentVariable("PULSO_AGENT_HTTP_RETRY_BASE_MS", "25");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        foreach (var name in EnvVars)
        {
            Environment.SetEnvironmentVariable(name, null);
        }

        try
        {
            if (Directory.Exists(_homeDirectory))
            {
                Directory.Delete(_homeDirectory, recursive: true);
            }
        }
        catch
        {
            // best-effort cleanup
        }
    }
}
