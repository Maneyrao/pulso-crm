import { expect } from 'vitest';
import { toHaveNoViolations } from 'vitest-axe/dist/matchers.js';

// Se infiere el tipo del resultado desde la firma del propio matcher, en vez
// de depender directamente de `axe-core` (dependencia transitiva) sólo para
// este tipo.
type AxeResults = Parameters<typeof toHaveNoViolations>[0];

/**
 * Assertion de accesibilidad sobre un resultado de `axe()`. Se usa como
 * función en vez de `expect(x).toHaveNoViolations()` porque la extensión
 * ambient de tipos de `vitest-axe` para `expect` no aplica de forma limpia
 * sobre `Assertion<T>` de `@vitest/expect` (ver `vitest.setup.ts`).
 */
export function expectNoAxeViolations(results: AxeResults): void {
  const { pass, message } = toHaveNoViolations(results);
  expect(pass, pass ? undefined : message()).toBe(true);
}
