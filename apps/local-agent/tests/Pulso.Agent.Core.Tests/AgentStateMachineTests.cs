using Xunit;

namespace Pulso.Agent.Core.Tests;

public class AgentStateMachineTests
{
    [Fact]
    public void Starts_as_NotConfigured()
    {
        var sm = new AgentStateMachine();
        Assert.Equal(AgentState.NotConfigured, sm.Current);
    }

    [Fact]
    public void Pair_then_Approve_leads_to_Ready_when_device_and_backend_are_up()
    {
        var sm = new AgentStateMachine();

        sm.Pair();
        Assert.Equal(AgentState.PendingApproval, sm.Current);

        sm.DeviceConnected();
        // sigue pendiente de aprobación aunque haya lector
        Assert.Equal(AgentState.PendingApproval, sm.Current);

        sm.Approve();
        Assert.Equal(AgentState.Ready, sm.Current);
    }

    [Fact]
    public void Device_disconnected_moves_Ready_to_NoDevice_and_back()
    {
        var sm = ReadySetup();

        sm.DeviceDisconnected();
        Assert.Equal(AgentState.NoDevice, sm.Current);

        sm.DeviceConnected();
        Assert.Equal(AgentState.Ready, sm.Current);
    }

    [Fact]
    public void Backend_unreachable_takes_precedence_over_NoDevice()
    {
        var sm = ReadySetup();

        sm.DeviceDisconnected();
        sm.BackendUnreachable();

        Assert.Equal(AgentState.BackendDown, sm.Current);

        sm.BackendReachable();
        // el lector seguía desconectado debajo del BackendDown
        Assert.Equal(AgentState.NoDevice, sm.Current);
    }

    [Fact]
    public void Revoke_wins_from_any_state_and_is_terminal_to_Disabled()
    {
        var sm = ReadySetup();

        sm.Revoke("BLOCKED_VERSION");

        Assert.Equal(AgentState.Disabled, sm.Current);
        Assert.Equal("BLOCKED_VERSION", sm.Reason);

        // ya revocado: ni el lector ni el backend lo sacan de Disabled.
        sm.DeviceConnected();
        sm.BackendReachable();
        Assert.Equal(AgentState.Disabled, sm.Current);
    }

    [Fact]
    public void OperationStarted_requires_Ready_and_moves_to_Busy()
    {
        var sm = ReadySetup();

        sm.OperationStarted();
        Assert.Equal(AgentState.Busy, sm.Current);

        sm.OperationEnded();
        Assert.Equal(AgentState.Ready, sm.Current);
    }

    [Fact]
    public void OperationStarted_throws_when_not_Ready()
    {
        var sm = new AgentStateMachine();
        sm.Pair();

        Assert.Throws<InvalidOperationException>(() => sm.OperationStarted());
    }

    [Fact]
    public void StateChanged_event_fires_with_previous_and_current()
    {
        var sm = new AgentStateMachine();
        var seen = new List<(AgentState Previous, AgentState Current)>();
        sm.StateChanged += (_, e) => seen.Add((e.Previous, e.Current));

        sm.Pair();

        Assert.Contains((AgentState.NotConfigured, AgentState.PendingApproval), seen);
    }

    [Fact]
    public void Approve_without_Pair_throws()
    {
        var sm = new AgentStateMachine();
        Assert.Throws<InvalidOperationException>(() => sm.Approve());
    }

    private static AgentStateMachine ReadySetup()
    {
        var sm = new AgentStateMachine();
        sm.Pair();
        sm.DeviceConnected();
        sm.Approve();
        Assert.Equal(AgentState.Ready, sm.Current);
        return sm;
    }
}
