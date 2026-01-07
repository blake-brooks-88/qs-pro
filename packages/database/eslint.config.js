const baseConfig = require('@qs-pro/eslint-config');

module.exports = [
  ...baseConfig,
  {
    ignores: ['dist/', 'drizzle/'],
  }
];
