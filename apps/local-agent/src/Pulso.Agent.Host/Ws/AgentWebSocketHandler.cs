using System.Net.WebSockets;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Pulso.Agent.Core;
using Pulso.Agent.Core.Ports;
using Pulso.Agent.Protocol;
using Pulso.Agent.Protocol.Payloads;

namespace Pulso.Agent.Host.Ws;

/// <summary>
/// Ciclo de vida completo de una conexión al WS local: validación de Origin, una conexión activa
/// por vez, hello obligatorio en 5s, ping/pong, tope de 256KB, versión de protocolo y ruteo de
/// mensajes (WEBSOCKET_PROTOCOL.md §4-§8). Es el único componente que conoce WebSockets; todo lo
/// demás (Core, Sensors, Backend) es ajeno al transporte.
/// </summary>
public sealed class AgentWebSocketHandler(
    ConnectionRegistry registry,
    SessionManager sessions,
    OperationCoordinator coordinator,
    AgentStateMachine stateMachine,
    StatusSnapshotBuilder statusBuilder,
    IAgentAuditSink audit,
    AgentConfigSnapshot config,
    ILogger<AgentWebSocketHandler> logger)
{
    public async Task HandleAsync(HttpContext context)
    {
        if (!context.WebSockets.IsWebSocketRequest)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        var origin = context.Request.Headers.Origin.ToString();
        if (!IsOriginAllowed(origin))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            audit.Record("AUTH_FAILED", AuditSeverity.Warn, "origin rejected",
                new Dictionary<string, string> { ["origin"] = string.IsNullOrEmpty(origin) ? "(none)" : origin });
            return;
        }

        using var socket = await context.WebSockets.AcceptWebSocketAsync().ConfigureAwait(false);
        var connection = new AgentConnection(socket);

        var previous = registry.Replace(connection);
        if (previous is not null)
        {
            sessions.CancelCurrent("NEW_CONNECTION");
            _ = previous.ReplaceAndCloseAsync(CancellationToken.None);
        }

        try
        {
            await RunConnectionAsync(connection, context.RequestAborted).ConfigureAwait(false);
        }
        finally
        {
            registry.Remove(connection);

            // Si esta conexión seguía siendo la activa, cualquier operación suya se cancela al caerse.
            sessions.CancelCurrent("CONNECTION_CLOSED");
        }
    }

    private bool IsOriginAllowed(string origin) =>
        !string.IsNullOrEmpty(origin) && config.AllowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);

    private async Task RunConnectionAsync(AgentConnection connection, CancellationToken requestAborted)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        var helloReceived = false;

        var watchdog = Task.Run(() => WatchdogLoopAsync(connection, () => helloReceived, cts), cts.Token);

        try
        {
            while (connection.Socket.State == WebSocketState.Open && !cts.IsCancellationRequested)
            {
                ReadResult read;
                try
                {
                    read = await WebSocketMessageReader.ReadTextMessageAsync(connection.Socket, cts.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (WebSocketException)
                {
                    break;
                }

                if (read.Outcome == ReadOutcome.Closed)
                {
                    break;
                }

                if (read.Outcome == ReadOutcome.TooLarge)
                {
                    await connection.CloseAsync(CloseCodes.MessageTooLarge, "message too large", cts.Token).ConfigureAwait(false);
                    break;
                }

                connection.Touch();

                var parsed = MessageCodec.TryParse(read.Text!);
                if (!parsed.Success)
                {
                    if (parsed.ShouldClose)
                    {
                        await connection.CloseAsync(parsed.CloseCode!.Value, parsed.Error!.Code, cts.Token).ConfigureAwait(false);
                        break;
                    }

                    await connection.SendAsync(
                        MessageCodec.Serialize(MessageTypes.Error, new ErrorPayload { Code = parsed.Error!.Code, Detail = parsed.Error.Detail }),
                        cts.Token).ConfigureAwait(false);
                    continue;
                }

                var envelope = parsed.Message!.Envelope;

                if (!helloReceived && envelope.Type != MessageTypes.Hello)
                {
                    logger.LogWarning("Mensaje '{Type}' recibido antes de hello.", envelope.Type);
                    await connection.SendAsync(
                        MessageCodec.Serialize(MessageTypes.Error, new ErrorPayload { Code = ErrorCodes.HelloRequired }),
                        cts.Token).ConfigureAwait(false);
                    continue;
                }

                if (envelope.Type == MessageTypes.Hello)
                {
                    helloReceived = true;
                }

                await DispatchAsync(connection, parsed.Message, cts.Token).ConfigureAwait(false);
            }
        }
        finally
        {
            cts.Cancel();
            await Safe(() => watchdog).ConfigureAwait(false);
        }
    }

    /// <summary>hello en 5s (4004) y ping/pong (4008), WEBSOCKET_PROTOCOL.md §4/§7-§8.</summary>
    private static async Task WatchdogLoopAsync(AgentConnection connection, Func<bool> helloReceived, CancellationTokenSource cts)
    {
        try
        {
            await Task.Delay(ProtocolConstants.HelloTimeout, cts.Token).ConfigureAwait(false);
            if (!helloReceived())
            {
                await connection.CloseAsync(CloseCodes.HelloTimeout, "hello required", CancellationToken.None).ConfigureAwait(false);
                cts.Cancel();
                return;
            }

            using var timer = new PeriodicTimer(HostConstants.WatchdogPollInterval);
            while (await timer.WaitForNextTickAsync(cts.Token).ConfigureAwait(false))
            {
                if (connection.IdleFor > HostConstants.PingPongLostThreshold)
                {
                    await connection.CloseAsync(CloseCodes.PingPongLost, "ping/pong lost", CancellationToken.None).ConfigureAwait(false);
                    cts.Cancel();
                    return;
                }
            }
        }
        catch (OperationCanceledException)
        {
            // conexión terminó por otra vía; nada que hacer.
        }
    }

    private async Task DispatchAsync(AgentConnection connection, ParsedMessage message, CancellationToken ct)
    {
        var envelope = message.Envelope;

        if (!config.TlsEnabled && !MessageTypes.AllowedWithoutTls.Contains(envelope.Type))
        {
            await connection.SendAsync(
                MessageCodec.Serialize(MessageTypes.Error, new ErrorPayload { Code = ErrorCodes.TlsRequired, OpId = ExtractOpId(message.TypedPayload) }),
                ct).ConfigureAwait(false);
            return;
        }

        switch (envelope.Type)
        {
            case MessageTypes.Hello:
                var ack = await statusBuilder.BuildHelloAckAsync(ct).ConfigureAwait(false);
                await connection.SendAsync(MessageCodec.Serialize(MessageTypes.HelloAck, ack, envelope.Id), ct).ConfigureAwait(false);
                break;

            case MessageTypes.StatusGet:
                var status = await statusBuilder.BuildAsync(ct).ConfigureAwait(false);
                await connection.SendAsync(MessageCodec.Serialize(MessageTypes.Status, status, envelope.Id), ct).ConfigureAwait(false);
                break;

            case MessageTypes.Ping:
                await connection.SendAsync(MessageCodec.Serialize<object?>(MessageTypes.Pong, null, envelope.Id), ct).ConfigureAwait(false);
                break;

            case MessageTypes.EnrollStart:
                await StartEnrollAsync(connection, (EnrollStartPayload)message.TypedPayload!, ct).ConfigureAwait(false);
                break;

            case MessageTypes.IdentifyStart:
                await StartIdentifyAsync(connection, (IdentifyStartPayload)message.TypedPayload!, ct).ConfigureAwait(false);
                break;

            case MessageTypes.IdentifyStop:
                coordinator.StopIdentify(((IdentifyStopPayload)message.TypedPayload!).OpId);
                break;

            case MessageTypes.OperationCancel:
                var cancel = (OperationCancelPayload)message.TypedPayload!;
                coordinator.Cancel(cancel.OpId, cancel.Reason ?? "USER_CANCELLED");
                break;

            default:
                // Tipos de servidor (hello.ack, status, etc.) recibidos del cliente: no son válidos acá.
                await connection.SendAsync(
                    MessageCodec.Serialize(MessageTypes.Error, new ErrorPayload { Code = ErrorCodes.UnknownMessageType, Detail = $"'{envelope.Type}' no es un mensaje de cliente." }),
                    ct).ConfigureAwait(false);
                break;
        }
    }

    private async Task StartEnrollAsync(AgentConnection connection, EnrollStartPayload payload, CancellationToken ct)
    {
        var gate = GateOperationStart(payload.OpId);
        if (gate is not null)
        {
            await connection.SendAsync(MessageCodec.Serialize(MessageTypes.Error, gate), ct).ConfigureAwait(false);
            return;
        }

        _ = RunEnrollSafeAsync(connection, payload);
    }

    private async Task RunEnrollSafeAsync(AgentConnection connection, EnrollStartPayload payload)
    {
        try
        {
            await coordinator.RunEnrollAsync(payload, CancellationToken.None).ConfigureAwait(false);
        }
        catch (AgentBusyException)
        {
            await connection.SendAsync(
                MessageCodec.Serialize(MessageTypes.Error, new ErrorPayload { Code = ErrorCodes.AgentBusy, OpId = payload.OpId }),
                CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "enroll.start falló de forma inesperada (opId={OpId})", payload.OpId);
        }
    }

    private async Task StartIdentifyAsync(AgentConnection connection, IdentifyStartPayload payload, CancellationToken ct)
    {
        var gate = GateOperationStart(payload.OpId);
        if (gate is not null)
        {
            await connection.SendAsync(MessageCodec.Serialize(MessageTypes.Error, gate), ct).ConfigureAwait(false);
            return;
        }

        _ = RunIdentifySafeAsync(connection, payload);
    }

    private async Task RunIdentifySafeAsync(AgentConnection connection, IdentifyStartPayload payload)
    {
        try
        {
            await coordinator.RunIdentifyAsync(payload, CancellationToken.None).ConfigureAwait(false);
        }
        catch (AgentBusyException)
        {
            await connection.SendAsync(
                MessageCodec.Serialize(MessageTypes.Error, new ErrorPayload { Code = ErrorCodes.AgentBusy, OpId = payload.OpId }),
                CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "identify.start falló de forma inesperada (opId={OpId})", payload.OpId);
        }
    }

    private ErrorPayload? GateOperationStart(string opId) => stateMachine.Current switch
    {
        AgentState.NotConfigured => new ErrorPayload { Code = ErrorCodes.AgentNotConfigured, OpId = opId },
        AgentState.PendingApproval => new ErrorPayload { Code = ErrorCodes.AgentPendingApproval, OpId = opId },
        AgentState.Disabled => new ErrorPayload { Code = ErrorCodes.AgentDisabled, OpId = opId, Detail = stateMachine.Reason },
        AgentState.NoDevice => new ErrorPayload { Code = ErrorCodes.NoDevice, OpId = opId },
        AgentState.BackendDown => new ErrorPayload { Code = ErrorCodes.BackendUnreachable, OpId = opId },
        _ => null,
    };

    private static string? ExtractOpId(object? payload) => payload switch
    {
        EnrollStartPayload p => p.OpId,
        IdentifyStartPayload p => p.OpId,
        IdentifyStopPayload p => p.OpId,
        OperationCancelPayload p => p.OpId,
        _ => null,
    };

    private static async Task Safe(Func<Task> action)
    {
        try
        {
            await action().ConfigureAwait(false);
        }
        catch
        {
            // watchdog cancelado: nada que reportar.
        }
    }
}

/// <summary>Vista de sólo-lectura de la config relevante para el handler (evita acoplar a AgentConfig de Backend directamente aquí).</summary>
public sealed record AgentConfigSnapshot
{
    public required IReadOnlyList<string> AllowedOrigins { get; init; }
    public required bool TlsEnabled { get; init; }
}
