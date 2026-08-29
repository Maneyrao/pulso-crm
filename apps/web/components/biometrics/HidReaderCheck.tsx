'use client';

import * as React from 'react';
import { CheckCircle2, Fingerprint, RefreshCw, TriangleAlert } from 'lucide-react';
import { Alert, Button, StatusBadge } from '@pulso/ui';
import { getHidFingerprintClient, type HidCheckResult } from '@/lib/hid/client';

const TONE = {
  ready: 'success',
  'no-reader': 'warning',
  'client-missing': 'warning',
  unsupported: 'danger',
  error: 'danger',
  idle: 'neutral',
  checking: 'neutral',
} as const;

export function HidReaderCheck() {
  const [result, setResult] = React.useState<HidCheckResult | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);
  const [captureMessage, setCaptureMessage] = React.useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    setCaptureMessage(null);
    try {
      setResult(await getHidFingerprintClient().check());
    } finally {
      setChecking(false);
    }
  };

  const capture = async () => {
    setCapturing(true);
    setCaptureMessage(null);
    try {
      const sample = await getHidFingerprintClient().captureProbe();
      setCaptureMessage(
        `${sample.reader.model} recibió una muestra correctamente. La muestra se descartó y no se guardó.`,
      );
    } catch (error) {
      setCaptureMessage(error instanceof Error ? error.message : 'No se pudo probar la captura.');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <Alert
      tone={result?.state === 'ready' ? 'success' : result ? 'warning' : 'info'}
      title="Conexión HID DigitalPersona"
    >
      <div className="space-y-3">
        <p>
          Esta prueba usa el cliente local oficial de HID. No guarda ni muestra imágenes de huellas.
        </p>
        {result ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={TONE[result.state]}
              label={result.state === 'ready' ? 'Cliente y lector listos' : 'Requiere atención'}
            />
            <span>{result.message}</span>
          </div>
        ) : null}
        {captureMessage ? (
          <p
            className={
              result?.state === 'ready' && !captureMessage.startsWith('No se pudo')
                ? 'text-(--color-success)'
                : 'text-(--color-danger)'
            }
          >
            {captureMessage}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" loading={checking} onClick={() => void check()}>
            <RefreshCw className="h-4 w-4" aria-hidden={true} /> Comprobar HID
          </Button>
          <Button
            size="sm"
            disabled={result?.state !== 'ready'}
            loading={capturing}
            onClick={() => void capture()}
          >
            <Fingerprint className="h-4 w-4" aria-hidden={true} /> Probar captura
          </Button>
        </div>
        {result?.state === 'client-missing' ? (
          <p className="flex items-center gap-2 text-(--text-sm)">
            <TriangleAlert className="h-4 w-4" aria-hidden={true} /> Instalá HID Authentication
            Device Client y el driver Legacy/Non-WBF; no mezcles WBF con Legacy.
          </p>
        ) : null}
        {captureMessage?.includes('recibió una muestra') ? (
          <p className="flex items-center gap-2 text-(--text-sm)">
            <CheckCircle2 className="h-4 w-4" aria-hidden={true} /> Hardware, driver y cliente local
            responden correctamente.
          </p>
        ) : null}
      </div>
    </Alert>
  );
}
