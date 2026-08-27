using Xunit;

namespace Pulso.Agent.Integration.Tests;

public sealed class PairingBootstrapTests : AgentIntegrationTestBase
{
    protected override bool BootstrapPairing => true;

    [Fact]
    public void First_start_exchanges_the_pairing_secret_and_then_heartbeats()
    {
        Assert.Single(Backend.PairRequestBodies);
        var body = Backend.PairRequestBodies.Single();
        Assert.Contains("\"installationId\":\"00000000-0000-0000-0000-000000000123\"", body);
        Assert.Contains("\"secret\":\"pas_test-secret\"", body);
        Assert.NotEmpty(Backend.HeartbeatRequestBodies);
    }
}
