import { afterEach, describe, expect, it, vi } from 'vitest';
import { HidFingerprintClient } from './client';

const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');

function windowsBrowser(): void {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
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
      SampleFormat: { Intermediate: 2 },
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

  it('discards a probe after the reader emits a sample', async () => {
    windowsBrowser();
    window.Fingerprint = {
      SampleFormat: { Intermediate: 2 },
      WebApi: class {
        onSamplesAcquired?: () => void;
        onErrorOccurred?: () => void;
        onCommunicationFailed?: () => void;
        enumerateDevices = vi.fn().mockResolvedValue(['hid-4500']);
        getDeviceInfo = vi.fn().mockResolvedValue({ DeviceID: 'U.are.U 4500' });
        startAcquisition = vi.fn().mockImplementation(async () => this.onSamplesAcquired?.());
        stopAcquisition = vi.fn().mockResolvedValue(undefined);
      } as never,
    };

    const result = await new HidFingerprintClient().captureProbe();

    expect(result.reader.id).toBe('hid-4500');
  });
});
