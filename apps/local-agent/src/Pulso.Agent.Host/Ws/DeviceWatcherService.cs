using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Pulso.Agent.Core;
using Pulso.Agent.Core.Ports;
using Pulso.Agent.Protocol;
using Pulso.Agent.Protocol.Payloads;
using Pulso.Agent.Sensors;

namespace Pulso.Agent.Host.Ws;

/// <summary>
/// Equivalente liviano de DeviceMonitor (LOCAL_AGENT_ARCHITECTURE.md §4): escucha
/// SensorConnected/SensorDisconnected y hace polling de respaldo cada 5s. La detección real de
/// WM_DEVICECHANGE vive dentro de la implementación concreta del sensor en Windows (fuera de
/// alcance en este entorno); acá sólo se reacciona a los eventos que el sensor expone.
/// </summary>
public sealed class DeviceWatcherService(
    IFingerprintSensor sensor,
    AgentStateMachine stateMachine,
    ConnectionRegistry registry,
    IAgentAuditSink audit,
    ILogger<DeviceWatcherService> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);
    private bool _lastKnownOnline;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        sensor.SensorConnected += OnSensorConnected;
        sensor.SensorDisconnected += OnSensorDisconnected;

        try
        {
            using var timer = new PeriodicTimer(PollInterval);
            await PollOnceAsync(stoppingToken).ConfigureAwait(false);
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                await PollOnceAsync(stoppingToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // apagado normal
        }
        finally
        {
            sensor.SensorConnected -= OnSensorConnected;
            sensor.SensorDisconnected -= OnSensorDisconnected;
        }
    }

    private async Task PollOnceAsync(CancellationToken ct)
    {
        try
        {
            var devices = await sensor.EnumerateAsync(ct).ConfigureAwait(false);
            var online = devices.Count > 0;
            if (online != _lastKnownOnline)
            {
                _lastKnownOnline = online;
                if (online)
                {
                    stateMachine.DeviceConnected();
                }
                else
                {
                    stateMachine.DeviceDisconnected();
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Polling de dispositivos falló.");
        }
    }

    private void OnSensorConnected(object? sender, SensorEventArgs e)
    {
        _lastKnownOnline = true;
        stateMachine.DeviceConnected();
        audit.Record("DEVICE_CONNECTED", AuditSeverity.Info, "device connected",
            new Dictionary<string, string> { ["deviceId"] = e.SensorId });
        Broadcast(MessageTypes.DeviceConnected, new DeviceConnectedPayload { DeviceId = e.SensorId, Status = "ONLINE" });
    }

    private void OnSensorDisconnected(object? sender, SensorEventArgs e)
    {
        _lastKnownOnline = false;
        stateMachine.DeviceDisconnected();
        audit.Record("DEVICE_DISCONNECTED", AuditSeverity.Warn, "device disconnected",
            new Dictionary<string, string> { ["deviceId"] = e.SensorId, ["reason"] = e.Reason ?? "UNKNOWN" });
        Broadcast(MessageTypes.DeviceDisconnected, new DeviceDisconnectedPayload { DeviceId = e.SensorId, Reason = e.Reason ?? "UNKNOWN" });
    }

    private void Broadcast<TPayload>(string type, TPayload payload)
    {
        var connection = registry.Current;
        if (connection is null)
        {
            return;
        }

        var json = MessageCodec.Serialize(type, payload);
        _ = connection.SendAsync(json, CancellationToken.None);
    }
}
