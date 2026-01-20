const baseConfig = require('@qpp/eslint-config');

module.exports = [
  ...baseConfig,
  {
    ignores: ['dist/', 'drizzle/'],
  }
];
