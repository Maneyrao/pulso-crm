import { afterEach, describe, expect, it, vi } from 'vitest';
import { HidFingerprintClient } from './client';

const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');

function windowsBrowser(): void {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  });
}

afterEach(() => {
  delete window.Fingerprint;
  if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
});

describe('HidFingerprintClient', () => {
  it('explains when the HID local client is not installed', async () => {
    windowsBrowser();

    const result = await new HidFingerprintClient().check();

    expect(result.state).toBe('client-missing');
    expect(result.message).toContain('Authentication Device Client');
  });

  it('detects a reader through HID ADC', async () => {
    windowsBrowser();
    const enumerateDevices = vi.fn().mockResolvedValue(['hid-4500']);
    window.Fingerprint = {
      SampleFormat: { Intermediate: 2, PngImage: 5 },
      b64UrlTo64: (value: string) => value,
      WebApi: class {
        enumerateDevices = enumerateDevices;
        getDeviceInfo = vi.fn().mockResolvedValue({ DeviceID: 'U.are.U 4500' });
        startAcquisition = vi.fn();
        stopAcquisition = vi.fn();
      } as never,
    };

    const result = await new HidFingerprintClient().check();

    expect(result).toMatchObject({ state: 'ready', reader: { id: 'hid-4500' } });
    expect(result.reader?.model).toContain('U.are.U 4500');
  });

  it('returns the PNG sample and quality emitted by the HID reader', async () => {
    windowsBrowser();
    window.Fingerprint = {
      SampleFormat: { Intermediate: 2, PngImage: 5 },
      b64UrlTo64: (value: string) => value.replace(/-/g, '+').replace(/_/g, '/'),
      WebApi: class {
        onSamplesAcquired?: (event: { samples: string }) => void;
        onQualityReported?: (event: { quality: number }) => void;
        onErrorOccurred?: () => void;
        onCommunicationFailed?: () => void;
        enumerateDevices = vi.fn().mockResolvedValue(['hid-4500']);
        getDeviceInfo = vi.fn().mockResolvedValue({ DeviceID: 'U.are.U 4500' });
        startAcquisition = vi.fn().mockImplementation(async () => {
          this.onQualityReported?.({ quality: 0 });
          this.onSamplesAcquired?.({ samples: JSON.stringify(['iVBORw0KGgo_']) });
        });
        stopAcquisition = vi.fn().mockResolvedValue(undefined);
      } as never,
    };

    const result = await new HidFingerprintClient().captureSample();

    expect(result).toMatchObject({
      reader: { id: 'hid-4500' },
      pngBase64: 'iVBORw0KGgo/',
      qualityCode: 0,
    });
  });

  it('reuses one WebApi connection for detection and capture', async () => {
    windowsBrowser();
    let instances = 0;
    window.Fingerprint = {
      SampleFormat: { Intermediate: 2, PngImage: 5 },
      b64UrlTo64: (value: string) => value,
      WebApi: class {
        onSamplesAcquired?: (event: { samples: string }) => void;
        onQualityReported?: (event: { quality: number }) => void;
        onAcquisitionStarted?: () => void;
        onErrorOccurred?: (event: { error: number }) => void;
        onCommunicationFailed?: () => void;
        constructor() {
          instances += 1;
        }
        enumerateDevices = vi.fn().mockResolvedValue(['hid-4500']);
        getDeviceInfo = vi.fn().mockResolvedValue({ DeviceID: 'U.are.U 4500' });
        startAcquisition = vi.fn().mockImplementation(async () => {
          this.onAcquisitionStarted?.();
          this.onQualityReported?.({ quality: 0 });
          this.onSamplesAcquired?.({ samples: JSON.stringify(['png-sample']) });
        });
        stopAcquisition = vi.fn().mockResolvedValue(undefined);
      } as never,
    };
    const progress = vi.fn();
    const client = new HidFingerprintClient();

    await client.check();
    await client.captureSample(20_000, progress);

    expect(instances).toBe(1);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'reader-ready' }));
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'finger-detected', qualityCode: 0 }),
    );
  });

  it('stops the active HID acquisition when the operator disables fingerprint mode', async () => {
    windowsBrowser();
    const stopAcquisition = vi.fn().mockResolvedValue(undefined);
    const startAcquisition = vi.fn().mockResolvedValue(undefined);
    window.Fingerprint = {
      SampleFormat: { Intermediate: 2, PngImage: 5 },
      b64UrlTo64: (value: string) => value,
      WebApi: class {
        onSamplesAcquired?: (event: { samples: string }) => void;
        onQualityReported?: (event: { quality: number }) => void;
        onErrorOccurred?: () => void;
        onCommunicationFailed?: () => void;
        enumerateDevices = vi.fn().mockResolvedValue(['hid-4500']);
        getDeviceInfo = vi.fn().mockResolvedValue({ DeviceID: 'U.are.U 4500' });
        startAcquisition = startAcquisition;
        stopAcquisition = stopAcquisition;
      } as never,
    };
    const client = new HidFingerprintClient();
    const pending = client.captureSample();
    await vi.waitFor(() => expect(startAcquisition).toHaveBeenCalledOnce());

    await client.cancelCapture();

    await expect(pending).rejects.toThrow(/cancelada/i);
    expect(stopAcquisition).toHaveBeenCalledWith('hid-4500');
  });
});
