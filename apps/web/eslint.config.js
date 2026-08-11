import { frontend } from '@pulso/eslint-config';

export default [
  ...frontend,
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'],
  },
];
