import { config as loadEnv } from 'dotenv';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

loadEnv({ path: '../../.env', quiet: true });

// Los tests no necesitan el log de la aplicación: lo que importa es la aserción,
// no la traza. Se puede subir con LOG_LEVEL=info para depurar un caso puntual.
process.env['LOG_LEVEL'] ??= 'silent';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    pool: 'forks',
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
