import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// eslint-plugin-react v7 does not yet fully support ESLint 10 flat config.
// We enforce React correctness through react-hooks + react-refresh and a
// curated set of standalone rules below.
export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // ── Hooks (from plugin) ───────────────────────────────────────────────
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // set-state-in-effect flags async data-fetching patterns as false positives
      // (setState called inside async functions is safe; the rule can't trace awaits).
      'react-hooks/set-state-in-effect': 'off',

      // ── Unused vars — _ prefix marks intentionally unused ─────────────────
      'no-unused-vars': ['error', {
        vars: 'all',
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],

      // ── General JS quality ────────────────────────────────────────────────
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-duplicate-imports': 'error',
      'no-console': ['warn', { allow: ['error', 'warn'] }],

      // ── Safety ────────────────────────────────────────────────────────────
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-param-reassign': ['error', { props: false }],
    },
  },
])
