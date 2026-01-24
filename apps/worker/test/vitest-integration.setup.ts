/**
 * Vitest Integration Test Setup File
 *
 * This file runs BEFORE any integration tests and sets up required environment variables
 * with sensible test defaults.
 *
 * The `setIfMissing` pattern ensures:
 * - CI env vars are NOT clobbered (CI sets DATABASE_URL and REDIS_URL explicitly)
 * - Local development uses .env values when available
 */

/**
 * Sets an environment variable only if it's currently missing or empty.
 * Treats undefined, '', and whitespace-only strings as "missing".
 */
function setIfMissing(key: string, value: string): void {
  // eslint-disable-next-line security/detect-object-injection -- key is a hardcoded string literal
  const current = process.env[key];
  if (current === undefined || current.trim() === '') {
    // eslint-disable-next-line security/detect-object-injection -- key is a hardcoded string literal
    process.env[key] = value;
  }
}

// Force test environment
process.env.NODE_ENV = 'test';

// Application settings (only if missing)
setIfMissing('LOG_FORMAT', 'text');
setIfMissing('PORT', '3001');

// Encryption (64 hex chars = 32 bytes)
setIfMissing(
  'ENCRYPTION_KEY',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
);

// MCE configuration
setIfMissing('MCE_CLIENT_ID', 'test_client_id');
setIfMissing('MCE_CLIENT_SECRET', 'test_client_secret');

// Admin API key
setIfMissing('ADMIN_API_KEY', 'test_api_key');

// Redis connection (only if missing)
setIfMissing('REDIS_URL', 'redis://127.0.0.1:6379');
