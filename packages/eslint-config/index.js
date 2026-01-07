// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-plugin-prettier/recommended');
const security = require('eslint-plugin-security');
const globals = require('globals');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "error",
      "prettier/prettier": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/no-require-imports": "off",
      "security/detect-object-injection": "warn",
    },
  }
);