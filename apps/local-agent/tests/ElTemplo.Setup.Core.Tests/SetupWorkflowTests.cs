using ElTemplo.Setup.Core;
using Xunit;

namespace ElTemplo.Setup.Core.Tests;

public sealed class SetupWorkflowTests
{
    [Fact]
    public async Task FreshInstall_ProvisionsPairsAndApprovesBeforeStartingService()
    {
        var trace = new List<string>();
        var platform = new RecordingPlatform(trace);
        var crm = new RecordingCrm(trace);
        var pairer = new RecordingPairer(trace, isPaired: false);
        var reader = new RecordingReader(trace, ReaderCheck.Found("HID", "U.are.U 4500"));
        var workflow = new SetupWorkflow(platform, crm, pairer, reader);

        var result = await workflow.RunAsync(
            new SetupRequest("branch-1", "Recepción Windows"),
            progress: null,
            CancellationToken.None);

        Assert.Equal(
            new[] { "payloads", "paired?", "create", "pair", "approve", "service", "reader", "shortcuts" },
            trace);
        Assert.False(result.WasRepair);
        Assert.True(result.Reader.Detected);
    }

    [Fact]
    public async Task ExistingPairing_RepairsFilesAndSkipsProvisioning()
    {
        var trace = new List<string>();
        var workflow = new SetupWorkflow(
            new RecordingPlatform(trace),
            new RecordingCrm(trace),
            new RecordingPairer(trace, isPaired: true),
            new RecordingReader(trace, ReaderCheck.NotDetected("Conectá el lector.")));

        var result = await workflow.RunAsync(
            new SetupRequest(null, "Recepción Windows"),
            progress: null,
            CancellationToken.None);

        Assert.Equal(new[] { "payloads", "paired?", "service", "reader", "shortcuts" }, trace);
        Assert.True(result.WasRepair);
        Assert.False(result.Reader.Detected);
    }

    [Fact]
    public async Task Progress_IsMonotonicAndEndsCompleted()
    {
        var updates = new List<SetupProgress>();
        var trace = new List<string>();
        var workflow = new SetupWorkflow(
            new RecordingPlatform(trace),
            new RecordingCrm(trace),
            new RecordingPairer(trace, isPaired: false),
            new RecordingReader(trace, ReaderCheck.Found("HID", "U.are.U 4500")));

        await workflow.RunAsync(
            new SetupRequest("branch-1", "Recepción Windows"),
            new InlineProgress<SetupProgress>(updates.Add),
            CancellationToken.None);

        Assert.NotEmpty(updates);
        Assert.Equal(SetupStage.Completed, updates[^1].Stage);
        Assert.Equal(100, updates[^1].Percent);
        Assert.True(updates.Zip(updates.Skip(1)).All(pair => pair.First.Percent <= pair.Second.Percent));
    }

    [Fact]
    public async Task Failure_IsSanitizedAndDoesNotExposePairingSecret()
    {
        var trace = new List<string>();
        var workflow = new SetupWorkflow(
            new RecordingPlatform(trace),
            new RecordingCrm(trace),
            new FailingPairer(trace, "pps_super-secret"),
            new RecordingReader(trace, ReaderCheck.Found("HID", "U.are.U 4500")));

        var error = await Assert.ThrowsAsync<SetupFailureException>(() => workflow.RunAsync(
            new SetupRequest("branch-1", "Recepción Windows"),
            progress: null,
            CancellationToken.None));

        Assert.Equal(SetupStage.PairingAgent, error.Stage);
        Assert.Equal("SETUP_PAIRING_FAILED", error.DiagnosticCode);
        Assert.DoesNotContain("pps_super-secret", error.Message, StringComparison.Ordinal);
        Assert.Null(error.InnerException);
    }

    private sealed class RecordingPlatform(List<string> trace) : IInstallerPlatform
    {
        public Task InstallPayloadsAsync(CancellationToken cancellationToken)
        {
            trace.Add("payloads");
            return Task.CompletedTask;
        }

        public Task InstallServiceAsync(CancellationToken cancellationToken)
        {
            trace.Add("service");
            return Task.CompletedTask;
        }

        public Task CreateShortcutsAsync(CancellationToken cancellationToken)
        {
            trace.Add("shortcuts");
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingCrm(List<string> trace) : ICrmProvisioner
    {
        public Task<ProvisionedAgent> CreateAgentAsync(string branchId, string name, CancellationToken cancellationToken)
        {
            trace.Add("create");
            return Task.FromResult(new ProvisionedAgent("agent-1", "installation-1", "pps_once"));
        }

        public Task ApproveAgentAsync(string agentId, CancellationToken cancellationToken)
        {
            trace.Add("approve");
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingPairer(List<string> trace, bool isPaired) : IAgentPairer
    {
        public Task<bool> IsPairedAsync(CancellationToken cancellationToken)
        {
            trace.Add("paired?");
            return Task.FromResult(isPaired);
        }

        public Task PairAsync(string installationId, string pairingSecret, CancellationToken cancellationToken)
        {
            trace.Add("pair");
            return Task.CompletedTask;
        }
    }

    private sealed class FailingPairer(List<string> trace, string secret) : IAgentPairer
    {
        public Task<bool> IsPairedAsync(CancellationToken cancellationToken)
        {
            trace.Add("paired?");
            return Task.FromResult(false);
        }

        public Task PairAsync(string installationId, string pairingSecret, CancellationToken cancellationToken)
        {
            trace.Add("pair");
            throw new InvalidOperationException($"No se pudo usar {secret}");
        }
    }

    private sealed class RecordingReader(List<string> trace, ReaderCheck result) : IReaderProbe
    {
        public Task<ReaderCheck> CheckAsync(CancellationToken cancellationToken)
        {
            trace.Add("reader");
            return Task.FromResult(result);
        }
    }

    private sealed class InlineProgress<T>(Action<T> report) : IProgress<T>
    {
        public void Report(T value) => report(value);
    }
}
