'use client';

import * as React from 'react';
import type { AccessCheckResponse } from '@pulso/contracts/access';
import { AccessResultOverlay } from '@/components/access/AccessResultOverlay';
import { identifyHid } from '@/lib/api/biometrics';
import { usePermission } from '@/lib/auth/permissions';
import { getHidCaptureSession } from '@/lib/hid/session';
import type { HidSample, HidSampleOutcome } from '@/lib/hid/session';
import { useHidCaptureReporter } from '@/lib/hid/useHidSession';
import { useSessionStore } from '@/lib/stores/session';

interface FingerprintRuntime {
  suspend: () => Promise<void>;
  resume: () => void;
}

const FingerprintRuntimeContext = React.createContext<FingerprintRuntime>({
  suspend: async () => undefined,
  resume: () => undefined,
});

export function useFingerprintRuntime(): FingerprintRuntime {
  return React.useContext(FingerprintRuntimeContext);
}

/**
 * Mantiene el U4500 escuchando durante toda la sesión autenticada. No muestra
 * estado ni errores: una huella sin coincidencia se ignora visualmente y una
 * coincidencia abre el resultado de acceso, que además registra asistencia.
 */
export function GlobalFingerprintProvider({ children }: { children: React.ReactNode }) {
  const branchId = useSessionStore((state) => state.activeBranchId);
  const canOperate = usePermission('access:operate');
  const session = React.useMemo(() => getHidCaptureSession(), []);
  const [result, setResult] = React.useState<AccessCheckResponse | null>(null);
  const suspended = React.useRef(0);
  const mounted = React.useRef(true);
  const branchRef = React.useRef(branchId);

  React.useEffect(() => {
    branchRef.current = branchId;
  }, [branchId]);

  useHidCaptureReporter(branchId, session);

  const handleSample = React.useCallback(
    async (sample: HidSample): Promise<HidSampleOutcome> => {
      const activeBranch = branchRef.current;
      if (!activeBranch) return { kind: 'error' };
      try {
        const access = await identifyHid(
          {
            branchId: activeBranch,
            pngBase64: sample.pngBase64,
            qualityCode: sample.qualityCode,
            capture: {
              sessionId: sample.sessionId,
              deviceUid: sample.deviceUid,
              readerModel: session.getSnapshot().reader?.model ?? 'HID DigitalPersona',
              acquisitionStartedAt: session.getSnapshot().acquisitionStartedAt,
              acquiredAt: sample.acquiredAt,
              sampleBytes: sample.byteLength,
            },
          },
          crypto.randomUUID(),
        );
        if (mounted.current && access.member) setResult(access);
        return { kind: access.decision === 'ALLOWED' ? 'granted' : 'denied' };
      } catch {
        return { kind: 'error' };
      }
    },
    [session],
  );

  const start = React.useCallback(() => {
    if (!canOperate || !branchRef.current || suspended.current > 0 || session.isActive()) return;
    void session.start({ mode: 'continuous', onSample: handleSample }).catch(() => undefined);
  }, [canOperate, handleSample, session]);

  const suspend = React.useCallback(async () => {
    suspended.current += 1;
    await session.stop();
  }, [session]);

  const resume = React.useCallback(() => {
    suspended.current = Math.max(0, suspended.current - 1);
    if (suspended.current === 0) start();
  }, [start]);

  React.useEffect(() => {
    mounted.current = true;
    if (canOperate && branchId) start();
    return () => {
      mounted.current = false;
      void session.stop();
    };
  }, [branchId, canOperate, session, start]);

  const runtime = React.useMemo(() => ({ suspend, resume }), [resume, suspend]);

  return (
    <FingerprintRuntimeContext.Provider value={runtime}>
      {children}
      {result ? <AccessResultOverlay result={result} onDismiss={() => setResult(null)} /> : null}
    </FingerprintRuntimeContext.Provider>
  );
}
