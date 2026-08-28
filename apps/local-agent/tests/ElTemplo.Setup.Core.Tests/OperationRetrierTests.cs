using ElTemplo.Setup.Core;
using Xunit;

namespace ElTemplo.Setup.Core.Tests;

public sealed class OperationRetrierTests
{
    [Fact]
    public async Task Run_RetriesTransientIoFailuresUntilTheOperationSucceeds()
    {
        var attempts = 0;

        await OperationRetrier.RunAsync(
            () =>
            {
                attempts++;
                return attempts < 3
                    ? Task.FromException(new IOException("locked"))
                    : Task.CompletedTask;
            },
            attempts: 4,
            delay: TimeSpan.Zero,
            CancellationToken.None);

        Assert.Equal(3, attempts);
    }

    [Fact]
    public async Task Run_DoesNotRetryNonTransientFailures()
    {
        var attempts = 0;

        await Assert.ThrowsAsync<InvalidOperationException>(() => OperationRetrier.RunAsync(
            () =>
            {
                attempts++;
                throw new InvalidOperationException("invalid");
            },
            attempts: 4,
            delay: TimeSpan.Zero,
            CancellationToken.None));

        Assert.Equal(1, attempts);
    }
}
