import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

/**
 * Configuración base compartida.
 *
 * Las reglas de `no-restricted-syntax` no son estilo: cada una corresponde a un
 * control de SECURITY_MODEL.md. No se relajan sin un ADR que lo justifique.
 */
export const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-syntax': [
        'error',
        {
          // SECURITY_MODEL §7 — inyección SQL. Sólo se prohíben las variantes
          // *Unsafe*: reciben SQL como string y no parametrizan nada. Las
          // formas de tagged-template ($queryRaw`...`, $executeRaw`...`) sí
          // parametrizan automáticamente y quedan permitidas.
          selector:
            'CallExpression[callee.property.name=/^\\$queryRawUnsafe$|^\\$executeRawUnsafe$/]',
          message:
            'Prohibido $queryRawUnsafe/$executeRawUnsafe. Usá Prisma.sql con parámetros (SECURITY_MODEL §7).',
        },
        {
          // ADR-010 — dinero
          selector: 'CallExpression[callee.name="parseFloat"]',
          message:
            'parseFloat sobre importes rompe la precisión. Usá Prisma.Decimal o string decimal (ADR-010).',
        },
      ],
    },
  },
  prettier,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.mjs',
    ],
  },
);

/** Backend: además prohíbe console.* (hay que usar el logger estructurado). */
export const backend = tseslint.config(...base, {
  files: ['src/**/*.ts'],
  ignores: ['src/**/*.spec.ts', 'src/main.ts'],
  rules: {
    'no-console': 'error',
  },
});

/** Frontend: además prohíbe XSS por dangerouslySetInnerHTML y tokens en storage. */
export const frontend = tseslint.config(
  ...base,
  reactHooks.configs['recommended-latest'],
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.flatConfig.recommended.rules,
      // El monorepo usa exclusivamente App Router (apps/web/app), no existe
      // ningún directorio pages/. Esta regla es específica de Pages Router y
      // sólo genera ruido ("Pages directory cannot be found") sin aportar nada.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // SECURITY_MODEL §6 — XSS
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message: 'dangerouslySetInnerHTML está prohibido (SECURITY_MODEL §6).',
        },
        {
          // ADR-007 — tokens nunca accesibles por JS
          selector:
            'MemberExpression[object.name=/^localStorage$|^sessionStorage$/][property.name=/^setItem$/]',
          message:
            'Revisá qué guardás: los tokens y el deviceToken NUNCA van a storage (ADR-007). Si es UI state, usá el store de Zustand no persistido.',
        },
      ],
    },
  },
);

export default base;
