import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
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
  {
    linterOptions: {
      // Fail on disable comments for unknown / unused rules (common CI breaker).
      reportUnusedDisableDirectives: 'error',
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      // Keep disable comments honest: unknown rules (e.g. stale react-hooks)
      // must fail CI instead of silently drifting.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['apps/desktop/src/main/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./apps/desktop/tsconfig.node.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
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
    // Playwright fixtures expose `use` callbacks — not React Hooks.
    files: ['**/e2e/**/*.{ts,tsx}', '**/*.e2e.{ts,tsx}', '**/playwright/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
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
  {
    files: ['**/metro.config.js', '**/babel.config.js', '**/app.config.js', '**/*.config.cjs'],
    languageOptions: {
      globals: nodeGlobals,
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
)
