import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

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
