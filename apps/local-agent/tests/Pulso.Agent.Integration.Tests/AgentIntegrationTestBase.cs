using System.Net.WebSockets;
using Microsoft.AspNetCore.TestHost;
using Pulso.Agent.Protocol;
using Pulso.Agent.Protocol.Payloads;
using Xunit;

namespace Pulso.Agent.Integration.Tests;

/// <summary>
/// Fixture común: backend fake + Host real vía WebApplicationFactory + una conexión WS ya con
/// hello hecho y esperando a que el agente llegue a READY (pareo por credencial de dev + FakeSensor
/// online). Cada test de una subclase arranca todo de cero (xunit crea una instancia por test).
/// </summary>
public abstract class AgentIntegrationTestBase : IAsyncLifetime
{
    private WebSocket _socket = null!;

    protected FakeBackendServer Backend { get; private set; } = null!;
    protected PulsoAgentTestFactory Factory { get; private set; } = null!;
    protected AgentTestClient Client { get; private set; } = null!;

    /// <summary>
    /// true en casi todos los tests: ejercitan el comportamiento "real" del agente (con TLS
    /// configurado). Los tests de gating de WEBSOCKET_PROTOCOL.md §2 lo overridean a false.
    /// </summary>
    protected virtual bool TlsEnabled => true;

    public virtual async Task InitializeAsync()
    {
        Backend = new FakeBackendServer();
        await Backend.StartAsync().ConfigureAwait(false);

        Factory = new PulsoAgentTestFactory(Backend.BaseUrl, TlsEnabled);

        var wsClient = Factory.Server.CreateWebSocketClient();
        wsClient.ConfigureRequest = req => req.Headers["Origin"] = "http://localhost:3000";

        _socket = await wsClient.ConnectAsync(new Uri("ws://localhost/agent/v1"), CancellationToken.None).ConfigureAwait(false);
        Client = new AgentTestClient(_socket);

        await Client.SendAsync(MessageTypes.Hello, new HelloPayload { ClientVersion = "integration-tests" }).ConfigureAwait(false);
        await WaitUntilReadyAsync().ConfigureAwait(false);
    }

    private async Task WaitUntilReadyAsync()
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(15);
        while (DateTime.UtcNow < deadline)
        {
            ParsedMessage message;
            try
            {
                message = await Client.ReceiveAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                await Client.SendAsync(MessageTypes.StatusGet, (object?)null).ConfigureAwait(false);
                continue;
            }

            var state = message.TypedPayload switch
            {
                HelloAckPayload ack => ack.AgentState,
                StatusPayload status => status.AgentState,
                _ => null,
            };

            if (state == "READY")
            {
                return;
            }

            await Task.Delay(200).ConfigureAwait(false);
            await Client.SendAsync(MessageTypes.StatusGet, (object?)null).ConfigureAwait(false);
        }

        throw new TimeoutException("El agente no llegó a READY a tiempo (¿heartbeat/dispositivo no se resolvieron?).");
    }

    public virtual async Task DisposeAsync()
    {
        try
        {
            if (_socket.State == WebSocketState.Open)
            {
                await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "test done", CancellationToken.None).ConfigureAwait(false);
            }
        }
        catch
        {
            // best-effort
        }

        Factory.Dispose();
        await Backend.DisposeAsync().ConfigureAwait(false);
    }
}
