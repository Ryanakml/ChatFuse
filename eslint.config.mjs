import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['apps/dashboard/**', '**/dist/**', '**/node_modules/**', '**/.next/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
];
