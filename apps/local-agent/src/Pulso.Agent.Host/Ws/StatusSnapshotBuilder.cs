using Pulso.Agent.Backend;
using Pulso.Agent.Core;
using Pulso.Agent.Protocol;
using Pulso.Agent.Protocol.Payloads;
using Pulso.Agent.Sensors;

namespace Pulso.Agent.Host.Ws;

/// <summary>Construye el payload de hello.ack/status (mismo shape, §6.2) a partir del estado real.</summary>
public sealed class StatusSnapshotBuilder(AgentStateMachine stateMachine, IFingerprintSensor sensor, bool tlsEnabled)
{
    public async Task<StatusPayload> BuildAsync(CancellationToken ct)
    {
        IReadOnlyList<SensorInfo> devices;
        try
        {
            devices = await sensor.EnumerateAsync(ct).ConfigureAwait(false);
        }
        catch
        {
            devices = [];
        }

        return new StatusPayload
        {
            ProtocolVersion = ProtocolConstants.Version,
            AgentVersion = AgentVersionInfo.Current,
            AgentState = MapState(stateMachine.Current),
            Tls = tlsEnabled,
            Devices = devices.Select(MapDevice).ToList(),
            Reason = stateMachine.Reason,
        };
    }

    public async Task<HelloAckPayload> BuildHelloAckAsync(CancellationToken ct)
    {
        var status = await BuildAsync(ct).ConfigureAwait(false);
        return new HelloAckPayload
        {
            ProtocolVersion = status.ProtocolVersion,
            AgentVersion = status.AgentVersion,
            AgentState = status.AgentState,
            Tls = status.Tls,
            Devices = status.Devices,
            Reason = status.Reason,
        };
    }

    public static string MapState(AgentState state) => state switch
    {
        AgentState.NotConfigured => "NOT_CONFIGURED",
        AgentState.PendingApproval => "PENDING_APPROVAL",
        AgentState.Ready => "READY",
        AgentState.NoDevice => "NO_DEVICE",
        AgentState.Busy => "BUSY",
        AgentState.BackendDown => "BACKEND_DOWN",
        AgentState.Disabled => "DISABLED",
        _ => "UNKNOWN",
    };

    private static DeviceInfo MapDevice(SensorInfo info) => new()
    {
        DeviceId = info.SensorId,
        Kind = "FINGERPRINT_READER",
        Vendor = info.Vendor,
        Model = info.Model,
        SerialNumber = info.SerialNumber,
        Status = info.Status switch
        {
            SensorStatus.Online => "ONLINE",
            SensorStatus.Offline => "OFFLINE",
            _ => "ERROR",
        },
    };
}
