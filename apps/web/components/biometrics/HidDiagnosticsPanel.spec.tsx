import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HidDiagnostics } from '@/lib/hid/diagnostics';
import { HidCaptureSession } from '@/lib/hid/session';
import { createMemoryReaderLock } from '@/lib/hid/locks';
import {
  installFakeAdc,
  uninstallFakeAdc,
  fakePng,
  waitUntil,
  type FakeAdc,
} from '@/lib/hid/test/fake-adc';
import { resetHidWebApiForTests } from '@/lib/hid/webapi';

import { HidDiagnosticsPanel } from './HidDiagnosticsPanel';

const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
let adc: FakeAdc;
let diagnostics: HidDiagnostics;
let session: HidCaptureSession;

beforeEach(() => {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128',
  });
  resetHidWebApiForTests();
  adc = installFakeAdc();
  diagnostics = new HidDiagnostics();
  session = new HidCaptureSession({ lock: createMemoryReaderLock(), diagnostics, backoffMs: [10] });
});

afterEach(async () => {
  await session.stop();
  uninstallFakeAdc();
  if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
  vi.restoreAllMocks();
});

describe('HidDiagnosticsPanel', () => {
  it('muestra el entorno, el lector y los eventos HID recibidos', async () => {
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitUntil(() => session.getSnapshot().state === 'ACQUIRING');
    adc.placeFinger({ png: fakePng(64) });
    await waitUntil(() => session.getSnapshot().samplesReceived === 1);

    render(<HidDiagnosticsPanel session={session} diagnostics={diagnostics} />);

    // Versiones de SDK y estado del entorno.
    expect(screen.getByText(/WebSDK/i)).toBeInTheDocument();
    expect(screen.getByText('1.1.0')).toBeInTheDocument();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
    // Lector enumerado y estado de la sesión.
    expect(screen.getByText(/U\.are\.U 4500/)).toBeInTheDocument();
    // Eventos crudos de HID.
    expect(screen.getByText('hid.SamplesAcquired')).toBeInTheDocument();
    expect(screen.getByText('hid.QualityReported')).toBeInTheDocument();
    expect(screen.getByText('adc.start-acquisition')).toBeInTheDocument();
  });

  it('el informe descargable es JSON sanitizado y no contiene la huella', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:informe');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const png = fakePng(96);

    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitUntil(() => session.getSnapshot().state === 'ACQUIRING');
    adc.placeFinger({ png });
    await waitUntil(() => session.getSnapshot().samplesReceived === 1);

    render(<HidDiagnosticsPanel session={session} diagnostics={diagnostics} />);
    fireEvent.click(screen.getByRole('button', { name: /descargar informe/i }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    const text = await blob.text();
    expect(blob.type).toContain('application/json');
    expect(text).not.toContain(Buffer.from(png).toString('base64'));
    expect(text).not.toContain(Buffer.from(png).toString('base64url'));
    const report = JSON.parse(text) as { environment: Record<string, unknown>; entries: unknown[] };
    expect(report.environment).toMatchObject({ webSdkVersion: '1.1.0', windows: true });
    expect(report.entries.length).toBeGreaterThan(0);
  });

  it('avisa cuando la pestaña perdió el foco, que es cuando ADC deja de entregar muestras', async () => {
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitUntil(() => session.getSnapshot().state === 'ACQUIRING');
    render(<HidDiagnosticsPanel session={session} diagnostics={diagnostics} />);

    // El estado de foco de jsdom no es determinístico entre archivos: se fija
    // explícitamente antes de probar la transición.
    fireEvent.focus(window);
    expect(await screen.findByText('con foco')).toBeInTheDocument();

    fireEvent.blur(window);

    // Aviso explícito, además del dato crudo: es la causa más común de "apoyo
    // el dedo y no pasa nada" cuando el operador trabaja en otra ventana.
    expect(
      await screen.findByText(/HID entrega las muestras a la ventana activa/i),
    ).toBeInTheDocument();
    expect(screen.getByText('sin foco')).toBeInTheDocument();
  });

  it('el sondeo dicta el veredicto: el lector entrega en otro formato pero no en PngImage', async () => {
    adc.mutedFormats = [5];
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitUntil(() => session.getSnapshot().state === 'ACQUIRING');

    render(
      <HidDiagnosticsPanel session={session} diagnostics={diagnostics} probeMsPerFormat={60} />,
    );
    const unsubscribe = diagnostics.subscribe((entry) => {
      if (entry.type === 'probe.armed') adc.placeFinger();
    });
    fireEvent.click(screen.getByRole('button', { name: /sondear formatos/i }));

    expect(
      await screen.findByText(/no en PngImage/i, undefined, { timeout: 5_000 }),
    ).toBeInTheDocument();
    unsubscribe();
    expect(screen.getByText(/Intermediate \(2\)/)).toBeInTheDocument();
  });

  it('sin eventos todavía lo dice en vez de mostrar una lista vacía', () => {
    render(<HidDiagnosticsPanel session={session} diagnostics={diagnostics} />);
    expect(screen.getByText(/todavía no se registraron eventos/i)).toBeInTheDocument();
  });
});
