using SourceAFIS;

namespace Pulso.Agent.Sensors.WbfFingerJetSensor;

public static class SourceAfisEngine
{
    public static byte[] Extract(FingerprintImageSample image)
    {
        var decoded = new FingerprintImage(
            image.Width,
            image.Height,
            image.Pixels,
            new FingerprintImageOptions { Dpi = image.Dpi });
        return new FingerprintTemplate(decoded).ToByteArray();
    }

    public static double Match(byte[] probe, byte[] candidate)
    {
        var matcher = new FingerprintMatcher(new FingerprintTemplate(probe));
        return matcher.Match(new FingerprintTemplate(candidate));
    }
}
