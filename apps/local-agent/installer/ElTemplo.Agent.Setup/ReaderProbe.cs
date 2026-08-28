using ElTemplo.Setup.Core;
using Pulso.Agent.Sensors.WbfFingerJetSensor;

namespace ElTemplo.Agent.Setup;

internal sealed class ReaderProbe : IReaderProbe
{
    public async Task<ReaderCheck> CheckAsync(CancellationToken cancellationToken)
    {
        try
        {
            var readers = await new WindowsBiometricApi().EnumerateAsync(cancellationToken);
            var reader = readers.FirstOrDefault();
            return reader is null
                ? ReaderCheck.NotDetected("No encontramos el lector. Conectalo por USB o instalá el controlador oficial WBF.")
                : ReaderCheck.Found(reader.Manufacturer, reader.Model);
        }
        catch
        {
            return ReaderCheck.NotDetected("Windows todavía no puede usar el lector. Instalá el controlador oficial WBF y reintentá.");
        }
    }
}
