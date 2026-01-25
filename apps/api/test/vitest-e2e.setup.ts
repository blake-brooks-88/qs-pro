/**
 * Vitest E2E Setup File
 *
 * This file runs BEFORE any e2e tests and sets up required environment variables
 * with sensible test defaults.
 *
 * The `setIfMissing` pattern ensures:
 * - CI env vars are NOT clobbered (CI sets DATABASE_URL and REDIS_URL explicitly)
 * - Local development has sensible defaults (localhost services via docker-compose)
 */

/**
 * Sets an environment variable only if it's currently missing or empty.
 * Treats undefined, '', and whitespace-only strings as "missing".
 */
function setIfMissing(key: string, value: string): void {
  // eslint-disable-next-line security/detect-object-injection -- key is a hardcoded string literal, not user input
  const current = process.env[key];
  if (current === undefined || current.trim() === '') {
    // eslint-disable-next-line security/detect-object-injection -- key is a hardcoded string literal, not user input
    process.env[key] = value;
  }
}

// Force test environment
process.env.NODE_ENV = 'test';

// Application settings (only if missing)
setIfMissing('LOG_FORMAT', 'text');
setIfMissing('PORT', '3000');

// Session security (>= 32 chars for secret, >= 16 chars for salt)
setIfMissing('SESSION_SECRET', 'test-session-secret-at-least-32-chars');
setIfMissing('SESSION_SALT', '1234567890123456');

// Encryption (64 hex chars = 32 bytes)
setIfMissing(
  'ENCRYPTION_KEY',
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
);

// MCE OAuth configuration
setIfMissing('MCE_CLIENT_ID', 'test-id');
setIfMissing('MCE_CLIENT_SECRET', 'test-secret');
setIfMissing('MCE_REDIRECT_URI', 'http://localhost/callback');

// MCE JWT signing (>= 32 chars)
setIfMissing(
  'MCE_JWT_SIGNING_SECRET',
  'test-jwt-secret-at-least-32-chars-long',
);

// Cookie security flags
setIfMissing('COOKIE_SECURE', 'true');
setIfMissing('COOKIE_SAMESITE', 'none');
setIfMissing('COOKIE_PARTITIONED', 'true');

// Redis connection (used by BullMQ and ioredis clients)
setIfMissing('REDIS_URL', 'redis://127.0.0.1:6379');

// PostgreSQL connection (used by Drizzle ORM)
// Note: CI sets this explicitly; local dev uses docker-compose default
setIfMissing(
  'DATABASE_URL',
  'postgres://qs_runtime:LRknfJDBSHdo7aGrL3BLjpccBrEyE7QX5gfChn9y@127.0.0.1:5432/qs_pro',
);
