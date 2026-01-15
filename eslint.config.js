// @ts-check
/**
 * Root ESLint config for IDE integration and any root-level files.
 * Note: lint-staged routes files to workspace-specific configs instead.
 * App/package configs (apps/api, apps/web, packages/*) have their own configs
 * with workspace-appropriate rule overrides.
 */
const baseConfig = require('./packages/eslint-config');

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.cjs',
      '**/*.config.mjs',
    ],
  },
  ...baseConfig,
];
