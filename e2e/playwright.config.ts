import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de los flujos del MVP (TEST_STRATEGY §7).
 *
 * Corren contra la aplicación real con PostgreSQL y Redis levantados. No hay
 * mocks de red: si el flujo depende de que el backend cobre bien una cuota, eso
 * es exactamente lo que se prueba.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // comparten la base sembrada
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // En local se asume que `pnpm dev` ya está corriendo; en CI se levanta acá.
  ...(process.env['CI']
    ? {
        webServer: [
          {
            command: 'pnpm --filter @pulso/api start',
            url: 'http://localhost:4001/health/ready',
            reuseExistingServer: false,
            timeout: 60_000,
          },
          {
            command: 'pnpm --filter @pulso/web start',
            url: 'http://localhost:4000',
            reuseExistingServer: false,
            timeout: 60_000,
          },
        ],
      }
    : {}),
});
