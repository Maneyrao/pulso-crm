using System.Security.Cryptography;
using System.Text;

namespace Pulso.Agent.Sensors.FakeSensor;

/// <summary>
/// Implementación de <see cref="IFingerprintSensor"/> sin hardware, para tests de integración y
/// demos en cualquier SO (LOCAL_AGENT_ARCHITECTURE.md §3, §12). Genera muestras y templates
/// determinísticos: la misma configuración produce siempre los mismos bytes, lo que permite
/// aserciones exactas en tests sin depender de un lector real.
/// </summary>
public sealed class FakeSensor : IFingerprintSensor
{
    private readonly FakeSensorOptions _options;
    private int _captureCount;
    private volatile SensorStatus _status;

    public FakeSensor(FakeSensorOptions? options = null)
    {
        _options = options ?? new FakeSensorOptions();
        _status = _options.StartOffline ? SensorStatus.Offline : SensorStatus.Online;
    }

    public event EventHandler<SensorEventArgs>? SensorConnected;
    public event EventHandler<SensorEventArgs>? SensorDisconnected;

    /// <summary>Simula el lector siendo desenchufado. Dispara <see cref="SensorDisconnected"/>.</summary>
    public void SimulateUnplug(string reason = "USB_REMOVED")
    {
        _status = SensorStatus.Offline;
        SensorDisconnected?.Invoke(this, new SensorEventArgs(_options.SensorId, reason));
    }

    /// <summary>Simula el lector siendo reenchufado. Dispara <see cref="SensorConnected"/>.</summary>
    public void SimulatePlugIn()
    {
        _status = SensorStatus.Online;
        SensorConnected?.Invoke(this, new SensorEventArgs(_options.SensorId));
    }

    public Task<IReadOnlyList<SensorInfo>> EnumerateAsync(CancellationToken ct)
    {
        IReadOnlyList<SensorInfo> devices = _status == SensorStatus.Offline
            ? Array.Empty<SensorInfo>()
            :
            [
                new SensorInfo
                {
                    SensorId = _options.SensorId,
                    Vendor = _options.Vendor,
                    Model = _options.Model,
                    SerialNumber = _options.SerialNumber,
                    Status = _status,
                },
            ];

        return Task.FromResult(devices);
    }

    public async Task<CaptureResult> CaptureAsync(string sensorId, TimeSpan timeout, CancellationToken ct)
    {
        if (sensorId != _options.SensorId)
        {
            throw new SensorNotFoundException(sensorId);
        }

        if (_status != SensorStatus.Online)
        {
            throw new SensorDisconnectedException(sensorId);
        }

        if (_options.CaptureLatency > timeout)
        {
            throw new TimeoutException($"La captura simulada ({_options.CaptureLatency}) excede el timeout ({timeout}).");
        }

        await Task.Delay(_options.CaptureLatency, ct).ConfigureAwait(false);

        // Puede haberse desconectado durante el delay (simulación de USB_REMOVED en plena captura).
        if (_status != SensorStatus.Online)
        {
            throw new SensorDisconnectedException(sensorId);
        }

        var index = Interlocked.Increment(ref _captureCount) - 1;
        var quality = Math.Clamp(_options.QualityForSample?.Invoke(index) ?? _options.DefaultQuality, 0, 100);

        return new CaptureResult
        {
            SensorId = sensorId,
            CapturedAt = DateTimeOffset.UtcNow,
            ImageData = BuildDeterministicImage(sensorId, index, quality),
        };
    }

    public QualityScore EvaluateQuality(CaptureResult sample)
    {
        // La calidad viaja codificada en el primer byte de la imagen simulada (ver BuildDeterministicImage).
        if (sample.ImageData.Length == 0)
        {
            return new QualityScore { Value = 0 };
        }

        return new QualityScore { Value = sample.ImageData[0] };
    }

    public Task<TemplateResult> CreateTemplateAsync(
        IReadOnlyList<CaptureResult> samples,
        TemplateFormat fmt,
        CancellationToken ct)
    {
        if (samples.Count == 0)
        {
            throw new ArgumentException("Se requiere al menos una muestra para crear un template.", nameof(samples));
        }

        using var sha = SHA256.Create();
        using var stream = new MemoryStream();
        foreach (var sample in samples)
        {
            stream.Write(sample.ImageData);
        }

        var digest = sha.ComputeHash(stream.ToArray());
        var qualities = samples.Select(s => (int)EvaluateQuality(s).Value).ToArray();
        var averageQuality = (int)Math.Round(qualities.Average());

        var template = new TemplateResult
        {
            TemplateData = digest,
            Format = fmt,
            Quality = averageQuality,
        };

        return Task.FromResult(template);
    }

    private static byte[] BuildDeterministicImage(string sensorId, int index, int quality)
    {
        var seed = Encoding.UTF8.GetBytes($"{sensorId}:{index}:{quality}");
        var hash = SHA256.HashData(seed);

        var image = new byte[1 + hash.Length];
        image[0] = (byte)quality;
        hash.CopyTo(image, 1);
        return image;
    }
}
