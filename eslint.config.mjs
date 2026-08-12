import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  module: 'readonly',
  require: 'readonly',
}

export default tseslint.config(
  {
    ignores: [
      '**/out/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      'apps/desktop/native/**',
      'vendor/**',
      'apps/desktop/scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: 'Mobile must stay isolated from Electron. See docs/mobile/ISOLATION.md',
            },
            {
              name: 'better-sqlite3',
              message: 'Mobile must not use desktop native SQLite.',
            },
          ],
          patterns: [
            {
              group: ['**/apps/desktop/**', 'apps/desktop/**'],
              message: 'Do not import desktop app code into mobile.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/*.integration.test.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'packages/db/scripts/**/*.ts'],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
)
