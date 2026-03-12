import path from "node:path";

import { config } from "dotenv";

// Load repo root .env for local/dev parity (CI provides env vars explicitly).
config({ path: path.resolve(process.cwd(), "..", "..", ".env") });

function setIfMissing(key: string, value: string): void {
  // eslint-disable-next-line security/detect-object-injection -- trusted key
  const current = process.env[key];
  if (current === undefined || current.trim() === "") {
    // eslint-disable-next-line security/detect-object-injection -- trusted key
    process.env[key] = value;
  }
}

process.env.NODE_ENV = "test";
setIfMissing("LOG_FORMAT", "text");

// Backoffice auth config (only needed if any tests import the real Better Auth module)
setIfMissing("BETTER_AUTH_SECRET", "test-backoffice-auth-secret");
setIfMissing("BACKOFFICE_WEB_ORIGIN", "http://localhost:5174");
setIfMissing("BACKOFFICE_API_BASE_URL", "http://localhost:5175");

// Backoffice DB (drizzle + safety checks require this)
setIfMissing(
  "DATABASE_URL_BACKOFFICE",
  "postgres://qs_backoffice:change_me_dev_only@127.0.0.1:5432/qs_pro",
);
setIfMissing(
  "DATABASE_URL_MIGRATIONS",
  "postgres://qs_migrate:change_me_dev_only@127.0.0.1:5432/qs_pro",
);
setIfMissing(
  "DATABASE_URL",
  "postgres://qs_runtime:change_me_dev_only@127.0.0.1:5432/qs_pro",
);

// Encryption (64 hex chars)
setIfMissing(
  "ENCRYPTION_KEY",
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
);
