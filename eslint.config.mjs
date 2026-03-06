import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['apps/dashboard/**', '**/dist/**', '**/node_modules/**', '**/.next/**'],
  },
  {
    files: ['apps/api/src/**/*.{js,cjs,mjs,ts,tsx}', 'apps/worker/src/**/*.{js,cjs,mjs,ts,tsx}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
];
