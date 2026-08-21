namespace Pulso.Agent.Core;

/// <summary>
/// Deriva el estado público del agente (LOCAL_AGENT_ARCHITECTURE.md §6) a partir de señales
/// independientes: pareo, aprobación, revocación, conectividad del backend, presencia del lector
/// y si hay una operación en curso. Se modela como derivación en vez de una tabla de transiciones
/// ad-hoc porque el estado real depende de varias condiciones simultáneas (p.ej. backend caído Y
/// lector desconectado a la vez), y la precedencia documentada resuelve el empate:
/// Disabled > NotConfigured > PendingApproval > BackendDown > NoDevice > Busy > Ready.
/// </summary>
public sealed class AgentStateMachine
{
    private readonly object _lock = new();
    private bool _paired;
    private bool _approved;
    private bool _disabled;
    private bool _deviceOnline;
    private bool _backendOnline = true;
    private bool _busy;

    public AgentState Current { get; private set; } = AgentState.NotConfigured;

    /// <summary>Motivo legible sólo relevante en Disabled/PendingApproval/NotConfigured/BackendDown.</summary>
    public string? Reason { get; private set; }

    public event EventHandler<AgentStateChangedEventArgs>? StateChanged;

    public void Pair()
    {
        lock (_lock)
        {
            _paired = true;
            Recompute("PAIRED");
        }
    }

    public void Approve()
    {
        lock (_lock)
        {
            if (!_paired)
            {
                throw new InvalidOperationException("No se puede aprobar un agente que no fue pareado.");
            }

            _approved = true;
            Recompute("APPROVED");
        }
    }

    /// <summary>Revocado o versión bloqueada: desde cualquier estado, a Disabled (§6).</summary>
    public void Revoke(string reason)
    {
        lock (_lock)
        {
            _disabled = true;
            Recompute(reason);
        }
    }

    public void DeviceConnected()
    {
        lock (_lock)
        {
            _deviceOnline = true;
            Recompute("DEVICE_CONNECTED");
        }
    }

    public void DeviceDisconnected()
    {
        lock (_lock)
        {
            _deviceOnline = false;
            Recompute("DEVICE_DISCONNECTED");
        }
    }

    public void BackendReachable()
    {
        lock (_lock)
        {
            _backendOnline = true;
            Recompute("BACKEND_OK");
        }
    }

    public void BackendUnreachable()
    {
        lock (_lock)
        {
            _backendOnline = false;
            Recompute("BACKEND_DOWN");
        }
    }

    /// <summary>Se llama cuando arranca una operación de hardware. Exige estado Ready.</summary>
    public void OperationStarted()
    {
        lock (_lock)
        {
            if (Derive() != AgentState.Ready)
            {
                throw new InvalidOperationException($"No se puede iniciar una operación en estado {Current}.");
            }

            _busy = true;
            Recompute("OPERATION_STARTED");
        }
    }

    /// <summary>Fin, timeout o cancelación de la operación en curso: vuelve a Ready (u otro estado vigente).</summary>
    public void OperationEnded()
    {
        lock (_lock)
        {
            _busy = false;
            Recompute("OPERATION_ENDED");
        }
    }

    private void Recompute(string reason)
    {
        var next = Derive();
        if (next == Current)
        {
            return;
        }

        var previous = Current;
        Current = next;
        Reason = next is AgentState.Disabled or AgentState.PendingApproval or AgentState.NotConfigured
                 or AgentState.BackendDown
            ? reason
            : null;
        StateChanged?.Invoke(this, new AgentStateChangedEventArgs(previous, next, reason));
    }

    private AgentState Derive()
    {
        if (_disabled)
        {
            return AgentState.Disabled;
        }

        if (!_paired)
        {
            return AgentState.NotConfigured;
        }

        if (!_approved)
        {
            return AgentState.PendingApproval;
        }

        if (!_backendOnline)
        {
            return AgentState.BackendDown;
        }

        if (!_deviceOnline)
        {
            return AgentState.NoDevice;
        }

        return _busy ? AgentState.Busy : AgentState.Ready;
    }
}
