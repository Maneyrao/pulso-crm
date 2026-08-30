'use client';

import * as React from 'react';
import { recordHidCaptureEvents } from '@/lib/api/biometrics';
import { getHidDiagnostics, type HidDiagnostics } from './diagnostics';
import { HidCaptureEventReporter } from './reporter';
import { getHidCaptureSession, type HidCaptureSession, type HidSessionSnapshot } from './session';

/**
 * Suscribe un componente a la sesión de captura HID de la pestaña. La sesión
 * vive fuera de React (una sola instancia, un solo canal a ADC): el componente
 * sólo lee su estado, así que un re-render o un remount no reinician el lector
 * ni pierden los handlers de eventos.
 */
export function useHidSessionSnapshot(
  session: HidCaptureSession = getHidCaptureSession(),
): HidSessionSnapshot {
  return React.useSyncExternalStore(
    React.useCallback((listener) => session.subscribe(listener), [session]),
    React.useCallback(() => session.getSnapshot(), [session]),
    React.useCallback(() => session.getSnapshot(), [session]),
  );
}

/**
 * Mantiene vivo el envío de la bitácora del navegador a la API mientras haya
 * sede activa. Se desmonta con el componente y hace un último flush.
 */
export function useHidCaptureReporter(
  branchId: string | null,
  session: HidCaptureSession = getHidCaptureSession(),
  diagnostics: HidDiagnostics = getHidDiagnostics(),
): void {
  const branchRef = React.useRef(branchId);
  React.useEffect(() => {
    branchRef.current = branchId;
  }, [branchId]);

  React.useEffect(() => {
    const reporter = new HidCaptureEventReporter({
      diagnostics,
      getSessionId: () => session.getSnapshot().sessionId,
      getBranchId: () => branchRef.current,
      getDeviceUid: () => session.getSnapshot().reader?.id ?? null,
      send: (payload) => recordHidCaptureEvents(payload),
    });
    reporter.start();
    return () => {
      void reporter.flush().finally(() => reporter.stop());
    };
  }, [diagnostics, session]);
}
