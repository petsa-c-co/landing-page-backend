import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        // tsconfig.json excluye test/ (tiene su propio rootDir vía
        // test/jest-e2e.json para Jest); test/tsconfig.json lo cubre para
        // que ESLint pueda tipar también app.e2e-spec.ts.
        project: ['./tsconfig.json', './test/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // PROHIBIR any (IMPORTANTE para TypeScript)
      '@typescript-eslint/no-explicit-any': 'error',
      // Otras reglas de buenas prácticas
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
