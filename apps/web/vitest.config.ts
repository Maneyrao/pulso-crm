import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Zona horaria fija para los tests. Varias pantallas muestran horas en la hora
 * local del navegador (p.ej. el "pico horario" de asistencias usa
 * `Date#getHours`), que es lo correcto para una recepción en Argentina. Sin
 * fijarla, esos tests pasan en una máquina local y fallan en CI, que corre en
 * UTC.
 */
process.env.TZ = 'America/Argentina/Buenos_Aires';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@/': `${dirname}/`,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./lib/test/vitest.setup.ts'],
    include: ['**/*.spec.tsx', '**/*.spec.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
