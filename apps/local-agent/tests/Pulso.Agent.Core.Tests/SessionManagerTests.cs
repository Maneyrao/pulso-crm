using Xunit;

namespace Pulso.Agent.Core.Tests;

public class SessionManagerTests
{
    [Fact]
    public void Begin_allows_a_single_operation()
    {
        var sessions = new SessionManager();

        var handle = sessions.Begin("op-1", OperationKind.Enroll);

        Assert.Equal("op-1", handle.OpId);
        Assert.Equal("op-1", sessions.Current?.OpId);
    }

    [Fact]
    public void Begin_throws_AgentBusyException_when_an_operation_is_already_active()
    {
        var sessions = new SessionManager();
        sessions.Begin("op-1", OperationKind.Enroll);

        var ex = Assert.Throws<AgentBusyException>(() => sessions.Begin("op-2", OperationKind.Identify));

        Assert.Equal("op-1", ex.CurrentOpId);
    }

    [Fact]
    public void End_releases_the_slot_for_a_new_operation()
    {
        var sessions = new SessionManager();
        sessions.Begin("op-1", OperationKind.Enroll);

        sessions.End("op-1");
        var handle = sessions.Begin("op-2", OperationKind.Identify);

        Assert.Equal("op-2", handle.OpId);
    }

    [Fact]
    public void End_with_wrong_opId_does_not_release_the_active_operation()
    {
        var sessions = new SessionManager();
        sessions.Begin("op-1", OperationKind.Enroll);

        sessions.End("op-999");

        Assert.Throws<AgentBusyException>(() => sessions.Begin("op-2", OperationKind.Identify));
    }

    [Fact]
    public void CancelCurrent_cancels_the_token_and_frees_the_slot()
    {
        var sessions = new SessionManager();
        var handle = sessions.Begin("op-1", OperationKind.Enroll);

        sessions.CancelCurrent("USER_CANCELLED");

        Assert.True(handle.Cts.IsCancellationRequested);
        Assert.Null(sessions.Current);
    }

    [Fact]
    public async Task BeginAsync_waits_for_a_cancelled_operation_to_release_the_slot()
    {
        // Reproduce la carrera identify.stop → identify.start inmediato (WEBSOCKET_PROTOCOL.md §10.4):
        // el stop cancela el CTS pero el loop todavía no llegó a su finally cuando entra el start.
        var sessions = new SessionManager();
        var first = sessions.Begin("op-1", OperationKind.Identify);
        first.Cts.Cancel();

        var beginTask = sessions.BeginAsync("op-2", OperationKind.Identify, TimeSpan.FromSeconds(5));
        Assert.False(beginTask.IsCompleted);

        sessions.End("op-1");
        var handle = await beginTask;

        Assert.Equal("op-2", handle.OpId);
        Assert.Equal("op-2", sessions.Current?.OpId);
    }

    [Fact]
    public async Task BeginAsync_throws_AgentBusy_immediately_when_the_active_operation_is_not_cancelled()
    {
        var sessions = new SessionManager();
        sessions.Begin("op-1", OperationKind.Enroll);

        var ex = await Assert.ThrowsAsync<AgentBusyException>(
            () => sessions.BeginAsync("op-2", OperationKind.Identify, TimeSpan.FromSeconds(5)));

        Assert.Equal("op-1", ex.CurrentOpId);
    }

    [Fact]
    public async Task BeginAsync_throws_AgentBusy_when_the_teardown_grace_expires()
    {
        var sessions = new SessionManager();
        var first = sessions.Begin("op-1", OperationKind.Identify);
        first.Cts.Cancel();
        // Nadie llama End("op-1"): el teardown quedó colgado.

        var ex = await Assert.ThrowsAsync<AgentBusyException>(
            () => sessions.BeginAsync("op-2", OperationKind.Identify, TimeSpan.FromMilliseconds(50)));

        Assert.Equal("op-1", ex.CurrentOpId);
    }

    [Fact]
    public async Task Concurrent_Begin_calls_only_let_exactly_one_through()
    {
        var sessions = new SessionManager();
        const int attempts = 50;
        var successes = 0;

        var tasks = Enumerable.Range(0, attempts).Select(i => Task.Run(() =>
        {
            try
            {
                sessions.Begin($"op-{i}", OperationKind.Enroll);
                Interlocked.Increment(ref successes);
            }
            catch (AgentBusyException)
            {
                // esperado para todos menos uno
            }
        }));

        await Task.WhenAll(tasks);

        Assert.Equal(1, successes);
    }
}
