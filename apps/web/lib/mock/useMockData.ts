'use client';

import * as React from 'react';

/**
 * Datos de demostración con latencia simulada, para módulos cuyo backend
 * todavía no existe (docs/CONTROLFIT_PARITY_AUDIT.md §2). Imita la forma de
 * una query de TanStack para que el swap a `useQuery` + `lib/api/*` sea
 * mecánico: mismo destructuring, misma condición de loading.
 *
 * Regla: los datasets viven en `lib/mock/data/` y son deterministas — nada
 * de `Math.random()` en render, que rompe la hidratación.
 */
export function useMockData<T>(factory: () => T, delayMs = 400): {
  data: T | undefined;
  isLoading: boolean;
  isError: false;
} {
  const [data, setData] = React.useState<T | undefined>(undefined);
  const factoryRef = React.useRef(factory);
  factoryRef.current = factory;

  React.useEffect(() => {
    const id = window.setTimeout(() => setData(factoryRef.current()), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  return { data, isLoading: data === undefined, isError: false };
}
