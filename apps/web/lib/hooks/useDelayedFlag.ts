'use client';

import { useEffect, useState } from 'react';

/**
 * `true` recién después de `delayMs` de que `active` se puso en `true`. Sirve
 * para no mostrar un skeleton en respuestas rápidas (< ~150 ms), que
 * parpadearía más de lo que ayuda (FRONTEND_PLAN §6.3).
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return show;
}
