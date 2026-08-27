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
    private const int QualityBytes = 1;
    private const int IdentityBytes = 32;
    private readonly FakeSensorOptions _options;
    private readonly byte[] _identityHash;
    private int _captureCount;
    private volatile SensorStatus _status;

    public FakeSensor(FakeSensorOptions? options = null)
    {
        _options = options ?? new FakeSensorOptions();
        if (string.IsNullOrWhiteSpace(_options.Identity))
        {
            throw new ArgumentException("La identidad simulada no puede estar vacía.", nameof(options));
        }

        _identityHash = SHA256.HashData(Encoding.UTF8.GetBytes(_options.Identity.Trim()));
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

        var firstIdentity = ExtractIdentity(samples[0]);
        foreach (var sample in samples.Skip(1))
        {
            if (!firstIdentity.AsSpan().SequenceEqual(ExtractIdentity(sample)))
            {
                throw new ArgumentException("Todas las muestras deben pertenecer a la misma identidad simulada.", nameof(samples));
            }
        }

        var qualities = samples.Select(s => (int)EvaluateQuality(s).Value).ToArray();
        var averageQuality = (int)Math.Round(qualities.Average());

        var template = new TemplateResult
        {
            TemplateData = firstIdentity,
            Format = fmt,
            Quality = averageQuality,
        };

        return Task.FromResult(template);
    }

    private byte[] BuildDeterministicImage(string sensorId, int index, int quality)
    {
        var seed = Encoding.UTF8.GetBytes($"{sensorId}:{index}:{quality}");
        var captureHash = SHA256.HashData(seed);

        var image = new byte[QualityBytes + IdentityBytes + captureHash.Length];
        image[0] = (byte)quality;
        _identityHash.CopyTo(image, QualityBytes);
        captureHash.CopyTo(image, QualityBytes + IdentityBytes);
        return image;
    }

    private static byte[] ExtractIdentity(CaptureResult sample)
    {
        if (sample.ImageData.Length < QualityBytes + IdentityBytes)
        {
            throw new ArgumentException("La muestra simulada no contiene una identidad válida.", nameof(sample));
        }

        return sample.ImageData.AsSpan(QualityBytes, IdentityBytes).ToArray();
    }
}
