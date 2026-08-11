'use client';

import { useCallback, useRef } from 'react';

/** `Idempotency-Key` nueva: UUID, el formato que exige `idempotencyKeySchema`. */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export interface IdempotencyAttempt {
  /** Clave del intento actual. Estable entre renders y entre reintentos automáticos. */
  getKey: () => string;
  /**
   * Empieza un intento nuevo (ej. el usuario corrigió el formulario y vuelve a
   * enviar). Los reintentos automáticos de UN mismo intento (retry de
   * TanStack Query, el reintento tras refrescar sesión) nunca deben llamar a
   * esto: si lo hicieran, un doble click podría producir un alta doble.
   */
  renew: () => string;
}

/**
 * Hook que administra la `Idempotency-Key` de una operación con efecto
 * (cobro, alta de socio, movimiento de caja...). La clave se genera una sola
 * vez por intento y se reusa en los reintentos de ese mismo intento
 * (FRONTEND_PLAN §5 "Mutaciones").
 */
export function useIdempotencyKey(): IdempotencyAttempt {
  const keyRef = useRef<string | null>(null);

  const getKey = useCallback(() => {
    if (!keyRef.current) {
      keyRef.current = generateIdempotencyKey();
    }
    return keyRef.current;
  }, []);

  const renew = useCallback(() => {
    keyRef.current = generateIdempotencyKey();
    return keyRef.current;
  }, []);

  return { getKey, renew };
}
