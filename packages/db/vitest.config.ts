import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadEnv({ path: '../../.env', quiet: true });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // Cada archivo levanta su propio esquema; el arranque incluye migraciones.
    testTimeout: 30_000,
    hookTimeout: 180_000,
    pool: 'forks',
  },
});
