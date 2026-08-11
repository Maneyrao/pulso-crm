'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@pulso/ui';

/** Estado nunca sólo por color: texto + ícono, como el resto de StatusBadge. */
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

  return online ? (
    <StatusBadge tone="success" label="En línea" />
  ) : (
    <StatusBadge tone="danger" label="Sin conexión" />
  );
}
