namespace Pulso.Agent.Sensors.WbfFingerJetSensor;

/// <summary>U.are.U/compatible sensor through Windows Biometric Framework and SourceAFIS.</summary>
public sealed class WbfFingerJetSensor : IFingerprintSensor
{
    private readonly IWindowsBiometricApi _api;
    private readonly object _deviceLock = new();
    private HashSet<string>? _knownSensors;

    public WbfFingerJetSensor() : this(CreateNativeApi())
    {
    }

    public WbfFingerJetSensor(IWindowsBiometricApi api) => _api = api;

    public event EventHandler<SensorEventArgs>? SensorConnected;
    public event EventHandler<SensorEventArgs>? SensorDisconnected;

    public async Task<IReadOnlyList<SensorInfo>> EnumerateAsync(CancellationToken ct)
    {
        var units = await _api.EnumerateAsync(ct).ConfigureAwait(false);
        var devices = units.Select(unit => new SensorInfo
        {
            SensorId = SensorId(unit.UnitId),
            Vendor = unit.Manufacturer,
            Model = unit.Model == "Unknown" ? unit.Description : unit.Model,
            SerialNumber = unit.SerialNumber == "Unknown" ? null : unit.SerialNumber,
            Status = SensorStatus.Online,
        }).ToArray();

        PublishDeviceChanges(devices.Select(device => device.SensorId).ToHashSet(StringComparer.OrdinalIgnoreCase));
        return devices;
    }

    public async Task<CaptureResult> CaptureAsync(string sensorId, TimeSpan timeout, CancellationToken ct)
    {
        var unitId = ParseSensorId(sensorId);
        var units = await _api.EnumerateAsync(ct).ConfigureAwait(false);
        if (!units.Any(unit => unit.UnitId == unitId))
        {
            throw new SensorNotFoundException(sensorId);
        }

        var captured = await _api.CaptureAsync(unitId, timeout, ct).ConfigureAwait(false);
        var standardData = captured.StandardDataBlock;
        try
        {
            var image = Ansi381FingerprintParser.Parse(standardData);
            try
            {
                return new CaptureResult
                {
                    SensorId = sensorId,
                    CapturedAt = DateTimeOffset.UtcNow,
                    ImageData = FingerprintImageSampleCodec.Encode(image),
                };
            }
            finally
            {
                Array.Clear(image.Pixels);
            }
        }
        finally
        {
            Array.Clear(standardData);
        }
    }

    public QualityScore EvaluateQuality(CaptureResult sample)
    {
        var image = FingerprintImageSampleCodec.Decode(sample.ImageData);
        try
        {
            var mean = image.Pixels.Average(value => (double)value);
            var variance = image.Pixels.Average(value => Math.Pow(value - mean, 2));
            var contrast = Math.Sqrt(variance);
            var exposurePenalty = Math.Abs(mean - 127.5) / 127.5;
            var value = (int)Math.Round(Math.Clamp((contrast - 5) * 2 * (1 - exposurePenalty * 0.35), 0, 100));
            return new QualityScore { Value = value };
        }
        finally
        {
            Array.Clear(image.Pixels);
        }
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

        if (fmt != TemplateFormat.SourceAfisNative)
        {
            throw new NotSupportedException("El adaptador WBF produce templates SOURCEAFIS_3_14.");
        }

        ct.ThrowIfCancellationRequested();
        var ranked = samples
            .Select(sample => (Sample: sample, Quality: EvaluateQuality(sample).Value))
            .OrderByDescending(item => item.Quality)
            .ToArray();
        var image = FingerprintImageSampleCodec.Decode(ranked[0].Sample.ImageData);
        try
        {
            var template = SourceAfisEngine.Extract(image);
            var averageQuality = (int)Math.Round(ranked.Average(item => item.Quality));
            return Task.FromResult(new TemplateResult
            {
                TemplateData = template,
                Format = TemplateFormat.SourceAfisNative,
                Quality = averageQuality,
            });
        }
        finally
        {
            Array.Clear(image.Pixels);
        }
    }

    private void PublishDeviceChanges(HashSet<string> current)
    {
        HashSet<string>? previous;
        lock (_deviceLock)
        {
            previous = _knownSensors;
            _knownSensors = current;
        }

        if (previous is null)
        {
            return;
        }

        foreach (var connected in current.Except(previous, StringComparer.OrdinalIgnoreCase))
        {
            SensorConnected?.Invoke(this, new SensorEventArgs(connected));
        }

        foreach (var disconnected in previous.Except(current, StringComparer.OrdinalIgnoreCase))
        {
            SensorDisconnected?.Invoke(this, new SensorEventArgs(disconnected, "USB_REMOVED"));
        }
    }

    private static string SensorId(uint unitId) => $"WBF-{unitId}";

    private static IWindowsBiometricApi CreateNativeApi()
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("El Templo Agent con lector real requiere Windows.");
        }

        return new WindowsBiometricApi();
    }

    private static uint ParseSensorId(string sensorId)
    {
        const string prefix = "WBF-";
        if (!sensorId.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ||
            !uint.TryParse(sensorId.AsSpan(prefix.Length), out var unitId))
        {
            throw new SensorNotFoundException(sensorId);
        }

        return unitId;
    }
}
