using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace Pulso.Agent.Sensors.WbfFingerJetSensor;

/// <summary>
/// Keeps a foreground window owned by the interactive agent while WBF waits for
/// a sample. System-pool WBF capture is gated by Windows on the foreground app,
/// so this must never run from session 0.
/// </summary>
[SupportedOSPlatform("windows")]
internal sealed partial class WindowsCapturePrompt : IDisposable
{
    private const uint MbOk = 0;
    private const uint MbIconInformation = 0x40;
    private const uint MbSetForeground = 0x0001_0000;
    private const uint MbTopMost = 0x0004_0000;
    private const uint WmClose = 0x0010;
    private const string Title = "El Templo Huella";

    private readonly TaskCompletionSource _started = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Thread? _thread;
    private int _disposed;

    public static async Task<WindowsCapturePrompt> ShowAsync(CancellationToken cancellationToken)
    {
        if (!Environment.UserInteractive)
        {
            throw new InteractiveSessionRequiredException();
        }

        var prompt = new WindowsCapturePrompt();
        prompt._thread = new Thread(prompt.Run)
        {
            IsBackground = true,
            Name = "ElTemploCapturePrompt",
        };
        prompt._thread.SetApartmentState(ApartmentState.STA);
        prompt._thread.Start();
        await prompt._started.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
        await Task.Delay(TimeSpan.FromMilliseconds(150), cancellationToken).ConfigureAwait(false);
        return prompt;
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        var window = FindWindow(null, Title);
        if (window != IntPtr.Zero)
        {
            PostMessage(window, WmClose, IntPtr.Zero, IntPtr.Zero);
        }
    }

    private void Run()
    {
        _started.TrySetResult();
        _ = MessageBox(
            IntPtr.Zero,
            "Apoyá el dedo en el lector. Esta ventana se cerrará sola al terminar la captura.",
            Title,
            MbOk | MbIconInformation | MbSetForeground | MbTopMost);
    }

    [LibraryImport("user32.dll", EntryPoint = "MessageBoxW", StringMarshalling = StringMarshalling.Utf16)]
    private static partial int MessageBox(IntPtr owner, string text, string caption, uint type);

    [LibraryImport("user32.dll", EntryPoint = "FindWindowW", StringMarshalling = StringMarshalling.Utf16)]
    private static partial IntPtr FindWindow(string? className, string windowName);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
