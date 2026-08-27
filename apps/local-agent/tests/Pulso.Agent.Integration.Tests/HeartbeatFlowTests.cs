using Xunit;

namespace Pulso.Agent.Integration.Tests;

public sealed class HeartbeatFlowTests : AgentIntegrationTestBase
{
    [Fact]
    public void Heartbeat_reports_the_simulated_reader_as_online()
    {
        Assert.NotEmpty(Backend.HeartbeatRequestBodies);
        var body = Backend.HeartbeatRequestBodies.Last();
        Assert.Contains("\"deviceStatus\":\"ONLINE\"", body);
    }
}
