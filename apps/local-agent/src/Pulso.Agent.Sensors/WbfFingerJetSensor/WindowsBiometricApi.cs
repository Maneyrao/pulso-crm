using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace Pulso.Agent.Sensors.WbfFingerJetSensor;

/// <summary>Minimal WinBio interop used to enumerate readers and capture raw ANSI-381 images.</summary>
[SupportedOSPlatform("windows")]
public sealed partial class WindowsBiometricApi : IWindowsBiometricApi
{
    private const uint FingerprintFactor = 0x00000008;
    private const uint SystemPool = 1;
    private const uint RawSessionFlag = 0x00000001;
    private const byte NoPurposeAvailable = 0x00;
    private const byte RawDataFlag = 0x20;
    private const int WinBioBadCapture = unchecked((int)0x80098008);
    private const int WinBioCanceled = unchecked((int)0x80098004);
    private const int WinBioSensorUnavailable = unchecked((int)0x80098034);

    public Task<IReadOnlyList<WindowsBiometricUnit>> EnumerateAsync(CancellationToken ct)
    {
        RequireWindows();
        ct.ThrowIfCancellationRequested();
        IntPtr schemas = IntPtr.Zero;
        try
        {
            ThrowIfFailed(WinBioEnumBiometricUnits(FingerprintFactor, out schemas, out var count));
            var unitSize = Marshal.SizeOf<WinBioUnitSchema>();
            var units = new List<WindowsBiometricUnit>(checked((int)count));
            for (nuint index = 0; index < count; index++)
            {
                ct.ThrowIfCancellationRequested();
                var address = IntPtr.Add(schemas, checked((int)(index * (nuint)unitSize)));
                var unit = Marshal.PtrToStructure<WinBioUnitSchema>(address);
                units.Add(new WindowsBiometricUnit(
                    unit.UnitId,
                    Clean(unit.DeviceInstanceId),
                    Clean(unit.Description),
                    Clean(unit.Manufacturer),
                    Clean(unit.Model),
                    Clean(unit.SerialNumber)));
            }

            return Task.FromResult<IReadOnlyList<WindowsBiometricUnit>>(units);
        }
        finally
        {
            if (schemas != IntPtr.Zero)
            {
                WinBioFree(schemas);
            }
        }
    }

    public async Task<CapturedAnsi381Sample> CaptureAsync(uint unitId, TimeSpan timeout, CancellationToken ct)
    {
        RequireWindows();
        if (timeout <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(timeout));
        }

        using var timeoutCts = new CancellationTokenSource(timeout);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);
        try
        {
            return await Task.Run(() => CaptureBlocking(unitId, linked.Token), CancellationToken.None)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested && !ct.IsCancellationRequested)
        {
            throw new TimeoutException($"La captura biométrica excedió el timeout de {timeout.TotalSeconds:0} segundos.");
        }
    }

    private static CapturedAnsi381Sample CaptureBlocking(uint requestedUnitId, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        using var prompt = WindowsCapturePrompt.ShowAsync(ct).GetAwaiter().GetResult();
        uint session = 0;
        try
        {
            // WINBIO_DB_DEFAULT is the sentinel pointer (GUID*)1 for system-pool sessions.
            ThrowIfFailed(WinBioOpenSession(
                FingerprintFactor,
                SystemPool,
                RawSessionFlag,
                IntPtr.Zero,
                0,
                new IntPtr(1),
                out session));

            using var cancellation = ct.Register(static state =>
            {
                var handle = (uint)state!;
                if (handle != 0)
                {
                    WinBioCancel(handle);
                }
            }, session);

            while (true)
            {
                ct.ThrowIfCancellationRequested();
                IntPtr sample = IntPtr.Zero;
                try
                {
                    var result = WinBioCaptureSample(
                        session,
                        NoPurposeAvailable,
                        RawDataFlag,
                        out var capturedUnitId,
                        out sample,
                        out var sampleSize,
                        out _);

                    if (result == WinBioBadCapture)
                    {
                        continue;
                    }

                    if (result == WinBioCanceled && ct.IsCancellationRequested)
                    {
                        throw new OperationCanceledException(ct);
                    }

                    if (result == WinBioSensorUnavailable)
                    {
                        throw new SensorDisconnectedException($"WBF-{requestedUnitId}");
                    }

                    ThrowIfFailed(result);
                    if (capturedUnitId != requestedUnitId)
                    {
                        throw new SensorNotFoundException($"WBF-{requestedUnitId}");
                    }

                    return new CapturedAnsi381Sample(capturedUnitId, CopyStandardDataBlock(sample, sampleSize));
                }
                finally
                {
                    if (sample != IntPtr.Zero)
                    {
                        WinBioFree(sample);
                    }
                }
            }
        }
        finally
        {
            if (session != 0)
            {
                WinBioCloseSession(session);
            }
        }
    }

    private static byte[] CopyStandardDataBlock(IntPtr sample, nuint sampleSize)
    {
        if (sample == IntPtr.Zero || sampleSize < (nuint)Marshal.SizeOf<WinBioBir>())
        {
            throw new InvalidDataException("Windows devolvió un registro biométrico vacío.");
        }

        var bir = Marshal.PtrToStructure<WinBioBir>(sample);
        var start = (ulong)bir.StandardDataBlock.Offset;
        var size = (ulong)bir.StandardDataBlock.Size;
        if (size == 0 || start > (ulong)sampleSize || size > (ulong)sampleSize - start || size > int.MaxValue)
        {
            throw new InvalidDataException("El bloque biométrico estándar está fuera de los límites del BIR.");
        }

        var result = new byte[(int)size];
        Marshal.Copy(IntPtr.Add(sample, checked((int)start)), result, 0, result.Length);
        return result;
    }

    private static string Clean(string? value) => string.IsNullOrWhiteSpace(value) ? "Unknown" : value.TrimEnd('\0').Trim();

    private static void ThrowIfFailed(int hresult)
    {
        if (hresult < 0)
        {
            throw new Win32Exception(hresult, $"Windows Biometric Framework falló (HRESULT 0x{hresult:X8}).");
        }
    }

    private static void RequireWindows()
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("WindowsBiometricApi requiere Windows Biometric Framework.");
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WinBioBirData
    {
        public uint Size;
        public uint Offset;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WinBioBir
    {
        public WinBioBirData HeaderBlock;
        public WinBioBirData StandardDataBlock;
        public WinBioBirData VendorDataBlock;
        public WinBioBirData SignatureBlock;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WinBioVersion
    {
        public uint MajorVersion;
        public uint MinorVersion;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WinBioUnitSchema
    {
        public uint UnitId;
        public uint PoolType;
        public uint BiometricFactor;
        public uint SensorSubType;
        public uint Capabilities;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string DeviceInstanceId;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string Description;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string Manufacturer;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string Model;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string SerialNumber;

        public WinBioVersion FirmwareVersion;
    }

    [LibraryImport("winbio.dll")]
    private static partial int WinBioEnumBiometricUnits(uint factor, out IntPtr unitSchemaArray, out nuint unitCount);

    [LibraryImport("winbio.dll")]
    private static partial int WinBioOpenSession(
        uint factor,
        uint poolType,
        uint flags,
        IntPtr unitArray,
        nuint unitCount,
        IntPtr databaseId,
        out uint sessionHandle);

    [LibraryImport("winbio.dll")]
    private static partial int WinBioCaptureSample(
        uint sessionHandle,
        byte purpose,
        byte flags,
        out uint unitId,
        out IntPtr sample,
        out nuint sampleSize,
        out uint rejectDetail);

    [LibraryImport("winbio.dll")]
    private static partial int WinBioCancel(uint sessionHandle);

    [LibraryImport("winbio.dll")]
    private static partial int WinBioCloseSession(uint sessionHandle);

    [LibraryImport("winbio.dll")]
    private static partial void WinBioFree(IntPtr address);
}
