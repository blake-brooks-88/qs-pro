/**
 * Vitest Integration Test Setup for backend-shared
 *
 * This file runs BEFORE any integration tests and sets up required environment variables
 * with sensible test defaults.
 *
 * The `setIfMissing` pattern ensures:
 * - CI env vars are NOT clobbered (CI sets DATABASE_URL explicitly)
 * - Local development has sensible defaults (localhost services via docker-compose)
 */

/**
 * Sets an environment variable only if it's currently missing or empty.
 * Treats undefined, '', and whitespace-only strings as "missing".
 */
function setIfMissing(key: string, value: string): void {
  // eslint-disable-next-line security/detect-object-injection -- key is a hardcoded string literal, not user input
  const current = process.env[key];
  if (current === undefined || current.trim() === "") {
    // eslint-disable-next-line security/detect-object-injection -- key is a hardcoded string literal, not user input
    process.env[key] = value;
  }
}

// Force test environment
process.env.NODE_ENV = "test";

// Application settings (only if missing)
setIfMissing("LOG_FORMAT", "text");

// Encryption (64 hex chars = 32 bytes)
setIfMissing(
  "ENCRYPTION_KEY",
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
);

// MCE OAuth configuration
setIfMissing("MCE_CLIENT_ID", "test-client-id");
setIfMissing("MCE_CLIENT_SECRET", "test-client-secret");
setIfMissing("MCE_REDIRECT_URI", "http://localhost/callback");

// MCE JWT signing (>= 32 chars)
setIfMissing(
  "MCE_JWT_SIGNING_SECRET",
  "test-jwt-secret-at-least-32-chars-long",
);

// Database URL (defaults to local docker-compose)
setIfMissing(
  "DATABASE_URL",
  "postgres://postgres:password@127.0.0.1:5432/qs_pro",
);
