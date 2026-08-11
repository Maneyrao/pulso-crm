'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../api/errors.js';

/** No reintentar automáticamente errores 4xx: son de negocio, no transitorios. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Las mutaciones con dinero/mensajería usan Idempotency-Key propia
        // (ver lib/api/idempotency.ts); un retry automático de la librería
        // reenviaría con la misma clave, lo cual es seguro, pero se prefiere
        // que cada pantalla decida explícitamente cuándo reintentar.
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
