namespace ElTemplo.Setup.Core;

public static class OperationRetrier
{
    public static async Task RunAsync(
        Func<Task> operation,
        int attempts,
        TimeSpan delay,
        CancellationToken cancellationToken)
    {
        if (attempts < 1) throw new ArgumentOutOfRangeException(nameof(attempts));

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await operation();
                return;
            }
            catch (IOException) when (attempt < attempts)
            {
                await Task.Delay(delay, cancellationToken);
            }
        }
    }
}
