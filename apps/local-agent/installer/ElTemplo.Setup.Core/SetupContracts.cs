namespace ElTemplo.Setup.Core;

public interface IInstallerPlatform
{
    Task InstallPayloadsAsync(CancellationToken cancellationToken);

    Task InstallServiceAsync(CancellationToken cancellationToken);

    Task CreateShortcutsAsync(CancellationToken cancellationToken);
}

public interface ICrmProvisioner
{
    Task<ProvisionedAgent> CreateAgentAsync(
        string branchId,
        string name,
        CancellationToken cancellationToken);

    Task ApproveAgentAsync(string agentId, CancellationToken cancellationToken);
}

public interface ICrmAuthenticator
{
    Task<CrmSession> LoginAsync(
        string email,
        string password,
        CancellationToken cancellationToken);
}

public interface IAgentPairer
{
    Task<bool> IsPairedAsync(CancellationToken cancellationToken);

    Task PairAsync(
        string installationId,
        string pairingSecret,
        CancellationToken cancellationToken);
}

public interface IReaderProbe
{
    Task<ReaderCheck> CheckAsync(CancellationToken cancellationToken);
}
