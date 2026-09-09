import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'release/**',
      'src-tauri/**',
      '.tmp/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    rules: { 'linebreak-style': ['error', 'unix'] },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      'no-undef': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXAttribute > JSXExpressionContainer > :matches(ArrowFunctionExpression, FunctionExpression)',
          message: 'Use a named handler outside JSX (EM repository convention).',
        },
        {
          selector: 'ImportSpecifier[importKind="type"]',
          message: 'Use a separate import type declaration (EM repository convention).',
        },
      ],
    },
  },
  {
    files: ['src/features/**/services/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'FunctionDeclaration',
          message: 'Use arrow functions for services (EM repository convention).',
        },
        {
          selector: 'ImportSpecifier[importKind="type"]',
          message: 'Use a separate import type declaration (EM repository convention).',
        },
      ],
    },
  }
);
