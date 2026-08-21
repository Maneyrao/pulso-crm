'use client';

import { useEffect, useState } from 'react';
import { cn } from '@pulso/ui';

/**
 * Badge de conectividad del topbar (LEODARROSAFIT_ALIGNMENT_PLAN.md §2):
 * texto uppercase 10px + punto pulsante (`lfPulse`), nunca sólo color — el
 * texto "EN LÍNEA"/"SIN CONEXIÓN" es la señal real, el punto es refuerzo.
 */
export function ConnectionIndicator() {
  // `null` en el primer render (SSR/hidratación) evita un mismatch: se
  // decide el estado real recién en el cliente.
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online === null) return null;

  return (
    <div
      title={online ? 'Conexión activa' : 'Sin conexión'}
      className={cn(
        'flex items-center gap-1.5 border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider',
        online
          ? 'border-(--color-success) bg-(--color-success-subtle) text-(--color-success)'
          : 'border-(--color-danger) bg-(--color-danger-subtle) text-(--color-danger)',
      )}
    >
      <span
        aria-hidden={true}
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full animate-(--animate-lf-pulse)',
          online ? 'bg-(--color-success)' : 'bg-(--color-danger)',
        )}
      />
      <span className="hidden sm:inline">{online ? 'En línea' : 'Sin conexión'}</span>
    </div>
  );
}
