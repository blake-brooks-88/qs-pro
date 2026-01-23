// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-plugin-prettier/recommended');
const security = require('eslint-plugin-security');
const simpleImportSort = require('eslint-plugin-simple-import-sort');
const vitest = require('@vitest/eslint-plugin');
const globals = require('globals');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  prettier,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // ═══════════════════════════════════════════════════════════════
      // TYPESCRIPT - Strict type safety (non-type-aware rules only)
      // Type-aware rules like prefer-nullish-coalescing require projectService
      // and are configured in app-specific configs (api, web)
      // ═══════════════════════════════════════════════════════════════
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-non-null-assertion": "error",

      // ═══════════════════════════════════════════════════════════════
      // CODE QUALITY
      // ═══════════════════════════════════════════════════════════════
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",

      // ═══════════════════════════════════════════════════════════════
      // BEST PRACTICES
      // ═══════════════════════════════════════════════════════════════
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "no-throw-literal": "error",
      "prefer-template": "warn",
      "no-else-return": "warn",
      "no-useless-return": "error",
      "object-shorthand": "error",

      // ═══════════════════════════════════════════════════════════════
      // IMPORTS
      // ═══════════════════════════════════════════════════════════════
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",

      // ═══════════════════════════════════════════════════════════════
      // SECURITY & FORMATTING
      // ═══════════════════════════════════════════════════════════════
      "security/detect-object-injection": "warn",
      "prettier/prettier": "error",
    },
  },
  // ═══════════════════════════════════════════════════════════════════
  // VITEST TEST FILES
  // ═══════════════════════════════════════════════════════════════════
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    plugins: {
      vitest,
    },
    rules: {
      // Error-level rules (must fix)
      'vitest/expect-expect': 'error',
      'vitest/no-conditional-expect': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-identical-title': 'error',
      'vitest/no-duplicate-hooks': 'error',
      // Warning-level rules (should fix)
      'vitest/no-disabled-tests': 'warn',
      'vitest/prefer-hooks-in-order': 'warn',
      'vitest/prefer-hooks-on-top': 'warn',
      'vitest/prefer-to-be': 'warn',
      'vitest/prefer-to-have-length': 'warn',
    },
  }
);