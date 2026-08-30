import { frontend } from '@pulso/eslint-config';

export default [
  ...frontend,
  {
    // `public/vendor/**` es el SDK oficial de HID que `scripts/prepare-hid-websdk.mjs`
    // copia desde node_modules en cada build (y que .gitignore excluye): es código
    // de terceros, no se lintea ni se corrige acá.
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts', 'public/vendor/**'],
  },
];
