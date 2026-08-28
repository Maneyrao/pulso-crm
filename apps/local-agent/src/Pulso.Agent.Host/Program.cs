using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Pulso.Agent.Backend;
using Pulso.Agent.Backend.Http;
using Pulso.Agent.Core;
using Pulso.Agent.Core.Ports;
using Pulso.Agent.Host.Ws;
using Pulso.Agent.Sensors;
using Pulso.Agent.Sensors.FakeSensor;

// ---------------------------------------------------------------------------------------------
// Bootstrap: agent.json + secretos, ANTES de construir el host, porque Kestrel necesita el
// puerto/TLS ya resueltos (LOCAL_AGENT_ARCHITECTURE.md §3-§4, §11).
// ---------------------------------------------------------------------------------------------
var configStore = new ConfigStore();
var agentConfig = await configStore.LoadAsync();

// Override de sólo-tests/dev: Pulso.Agent.Integration.Tests apunta el BackendClient a un backend
// fake in-process sin tener que escribir un agent.json real (WebApplicationFactory ya no puede
// tocar esta parte del bootstrap, que corre antes de que exista el WebApplicationBuilder).
var backendBaseUrlOverride = Environment.GetEnvironmentVariable("PULSO_AGENT_BACKEND_BASE_URL");
if (!string.IsNullOrWhiteSpace(backendBaseUrlOverride))
{
    agentConfig.BackendBaseUrl = backendBaseUrlOverride;
}

// Idem para el flag de TLS: Integration.Tests corre sobre TestServer (sin sockets/TLS reales), así
// que necesita poder marcar tlsEnabled=true para ejercitar el gating de operaciones sensibles
// (WEBSOCKET_PROTOCOL.md §2) sin tener que generar un certificado real en cada corrida de tests.
var tlsEnabledOverride = Environment.GetEnvironmentVariable("PULSO_AGENT_TLS_ENABLED");
if (!string.IsNullOrWhiteSpace(tlsEnabledOverride))
{
    agentConfig.TlsEnabled = bool.Parse(tlsEnabledOverride);
}

// Persistimos siempre para que agent.json exista con los defaults documentados desde el primer arranque.
await configStore.SaveAsync(agentConfig);

var isWindows = OperatingSystem.IsWindows();
var isProduction = string.Equals(agentConfig.Environment, "production", StringComparison.OrdinalIgnoreCase);

ISecretStore secretStore = isWindows && isProduction
    ? new DpapiSecretStore()
    : new FileSecretStore();

// Atajo de desarrollo: permite arrancar sin implementar todavía el flujo interactivo de pareo
// (POST /agent/pair vía instalador/CLI, T-7.1 pendiente — ver README). Nunca usar en producción.
var devCredential = Environment.GetEnvironmentVariable("PULSO_AGENT_DEV_CREDENTIAL");
if (!string.IsNullOrWhiteSpace(devCredential))
{
    await secretStore.StoreAsync(SecretKeys.AgentCredential, devCredential);
}

// Primer arranque real/simulado: intercambia el installationId + secreto de un solo uso que
// muestra el CRM por la credencial de larga vida. Después del intercambio, el secreto no se
// persiste y no vuelve a servir en el backend.
var storedCredential = await secretStore.RetrieveAsync(SecretKeys.AgentCredential);
var installationId = Environment.GetEnvironmentVariable("PULSO_AGENT_INSTALLATION_ID");
var pairingSecret = Environment.GetEnvironmentVariable("PULSO_AGENT_PAIRING_SECRET");
if (storedCredential is null &&
    !string.IsNullOrWhiteSpace(installationId) &&
    !string.IsNullOrWhiteSpace(pairingSecret))
{
    using var pairingHttp = new HttpClient
    {
        BaseAddress = new Uri(agentConfig.BackendBaseUrl),
        Timeout = TimeSpan.FromSeconds(15),
    };
    var pairingClient = new BackendClient(pairingHttp);
    var paired = await pairingClient.PairAsync(new PairRequest
    {
        InstallationId = installationId,
        Secret = pairingSecret,
        MachineFingerprint = BuildMachineFingerprint(),
        AgentVersion = AgentVersionInfo.Current,
        OsVersion = RuntimeInformation.OSDescription,
    });
    await secretStore.StoreAsync(SecretKeys.AgentCredential, paired.AgentCredential);
    agentConfig.AgentId = paired.AgentId;
    await configStore.SaveAsync(agentConfig);
}

var sensorKind = Environment.GetEnvironmentVariable("PULSO_AGENT_SENSOR") ?? agentConfig.SensorKind;
var fakeIdentity = Environment.GetEnvironmentVariable("PULSO_AGENT_FAKE_IDENTITY") ?? "demo-finger-1";
IFingerprintSensor sensor = sensorKind.ToLowerInvariant() switch
{
    "wbf" or "fingerjet" => new Pulso.Agent.Sensors.WbfFingerJetSensor.WbfFingerJetSensor(),
    "hid" or "digitalpersona" => throw new NotSupportedException(
        "El adaptador legacy HID no está habilitado. Instalá el driver WBF y usá sensorKind=wbf."),
    _ => new FakeSensor(new FakeSensorOptions { Identity = fakeIdentity }),
};

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService(options => options.ServiceName = "ElTemploAgent");

builder.WebHost.ConfigureKestrel(options =>
{
    // Bind EXCLUSIVO a loopback (WEBSOCKET_PROTOCOL.md §2, BIOMETRIC_SECURITY.md §11.1). Si el
    // puerto está ocupado o no se puede bindear, Kestrel tira al arrancar y el proceso no queda vivo:
    // eso es intencional, "si no puede bindear loopback, no arranca".
    options.Listen(IPAddress.Loopback, agentConfig.WsPort, listenOptions =>
    {
        if (agentConfig.TlsEnabled && !string.IsNullOrWhiteSpace(agentConfig.TlsCertPath))
        {
            listenOptions.UseHttps(agentConfig.TlsCertPath, agentConfig.TlsCertPassword);
        }
    });
});

builder.Services.AddSingleton(sensor);
builder.Services.AddSingleton(secretStore);
builder.Services.AddSingleton(configStore);
builder.Services.AddSingleton<SessionManager>();
builder.Services.AddSingleton<AgentStateMachine>();
builder.Services.AddSingleton<ConnectionRegistry>();
builder.Services.AddSingleton<IOperationNotifier, AgentConnectionNotifier>();
builder.Services.AddSingleton(new AgentConfigSnapshot
{
    AllowedOrigins = agentConfig.AllowedOrigins,
    TlsEnabled = agentConfig.TlsEnabled,
});
builder.Services.AddSingleton(sp => new StatusSnapshotBuilder(
    sp.GetRequiredService<AgentStateMachine>(), sensor, agentConfig.TlsEnabled));
builder.Services.AddSingleton<OperationCoordinator>();
builder.Services.AddSingleton<AgentWebSocketHandler>();
builder.Services.AddHostedService<DeviceWatcherService>();

// Override de sólo-tests: acelera el backoff de reintentos HTTP (2s/4s/8s por defecto) para que
// Integration.Tests pueda ejercitar el camino BACKEND_UNREACHABLE sin ~14s de espera real.
var retryBaseMsOverride = Environment.GetEnvironmentVariable("PULSO_AGENT_HTTP_RETRY_BASE_MS");
TimeSpan? retryBaseDelay = !string.IsNullOrWhiteSpace(retryBaseMsOverride)
    ? TimeSpan.FromMilliseconds(double.Parse(retryBaseMsOverride, System.Globalization.CultureInfo.InvariantCulture))
    : null;

builder.Services.AddPulsoAgentBackend(agentConfig.BackendBaseUrl, retryBaseDelay);

var app = builder.Build();

app.UseWebSockets();

app.Map("/agent/v1", async (HttpContext context, AgentWebSocketHandler handler) => await handler.HandleAsync(context));

app.MapGet("/", () => Results.Ok(new { service = "Pulso Agent", status = "see ws /agent/v1" }));

app.Logger.LogInformation(
    "Pulso Agent escuchando en {Scheme}://127.0.0.1:{Port}/agent/v1 (sensor={Sensor}, tls={Tls}, env={Env})",
    agentConfig.TlsEnabled ? "wss" : "ws", agentConfig.WsPort, sensorKind, agentConfig.TlsEnabled, agentConfig.Environment);

app.Run();

static string BuildMachineFingerprint()
{
    var material = $"{Environment.MachineName}|{Environment.UserName}|{RuntimeInformation.OSDescription}";
    return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(material))).ToLowerInvariant();
}

// Necesario para que Pulso.Agent.Integration.Tests pueda usar WebApplicationFactory<Program>.
public partial class Program;
