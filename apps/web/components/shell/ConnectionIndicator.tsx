'use client';

import { useEffect, useState } from 'react';
import { cn } from '@pulso/ui';
import { API_BASE_URL } from '@/lib/api/client';

/**
 * Badge de conectividad del topbar (LEODARROSAFIT_ALIGNMENT_PLAN.md §2):
 * texto uppercase 10px + punto pulsante (`lfPulse`), nunca sólo color — el
 * texto "EN LÍNEA"/"SIN CONEXIÓN" es la señal real, el punto es refuerzo.
 */
export function ConnectionIndicator() {
  // `null` en el primer render (SSR/hidratación) evita un mismatch: se
  // decide el estado real recién en el cliente.
  const [state, setState] = useState<'checking' | 'online' | 'offline' | 'unavailable'>('checking');

  useEffect(() => {
    let disposed = false;
    let current: AbortController | undefined;
    let lastCheck = 0;
    const check = async () => {
      if (!navigator.onLine) {
        current?.abort();
        setState('offline');
        return;
      }
      if (document.visibilityState === 'hidden' || current || Date.now() - lastCheck < 15_000) return;
      lastCheck = Date.now();
      const controller = new AbortController();
      current = controller;
      setState('checking');
      const timeout = window.setTimeout(() => controller.abort(), 5_000);
      try {
        // Health no usa sesión, CSRF ni refresh automático.
        const response = await fetch(`${API_BASE_URL.replace(/\/api\/v1$/, '')}/health/ready`, {
          credentials: 'omit', cache: 'no-store', signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        const body: unknown = response.ok ? await response.json() : null;
        const healthy = typeof body === 'object' && body !== null &&
          'status' in body && body.status === 'ok' && 'checks' in body &&
          typeof body.checks === 'object' && body.checks !== null &&
          'db' in body.checks && body.checks.db === true &&
          'redis' in body.checks && body.checks.redis === true;
        if (!disposed) setState(!navigator.onLine ? 'offline' : healthy ? 'online' : 'unavailable');
      } catch {
        if (!disposed) setState(navigator.onLine ? 'unavailable' : 'offline');
      } finally {
        window.clearTimeout(timeout);
        current = undefined;
      }
    };
    const reconnect = () => { lastCheck = 0; void check(); };
    const refresh = () => { void check(); };
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      current?.abort();
      window.clearInterval(interval);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const online = state === 'online';
  const label = { checking: 'Verificando conexión', online: 'En línea', offline: 'Sin internet', unavailable: 'API no disponible' }[state];

  return (
    <div
      role="status"
      title={label}
      className={cn(
        'flex min-h-8 items-center gap-1.5 border px-2 py-1 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none',
        online
          ? 'border-(--color-success) bg-(--color-success-subtle) text-(--color-success)'
          : state === 'checking' ? 'border-(--color-border) text-(--color-muted)' : 'border-(--color-danger) bg-(--color-danger-subtle) text-(--color-danger)',
      )}
    >
      <span
        aria-hidden={true}
        className={cn(
          'h-1.5 w-1.5 shrink-0',
          online ? 'bg-(--color-success)' : 'bg-(--color-danger)',
        )}
      />
      <span>{label}</span>
    </div>
  );
}
