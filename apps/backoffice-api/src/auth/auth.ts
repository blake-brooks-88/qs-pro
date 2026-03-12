import { assertSafeBackofficeDatabaseUrl } from "@qpp/backend-shared";
import {
  boAccounts,
  boSessions,
  boTwoFactors,
  boUsers,
  boVerifications,
} from "@qpp/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, twoFactor } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function getBackofficeAuthConfigFromEnv(env: NodeJS.ProcessEnv): {
  databaseUrl: string;
  authSecret: string;
  trustedOrigins: string[];
} {
  const databaseUrl = env.DATABASE_URL_BACKOFFICE;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL_BACKOFFICE is required");
  }

  const authSecret = env.BETTER_AUTH_SECRET;
  if (!authSecret) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }

  return {
    databaseUrl,
    authSecret,
    trustedOrigins: [env.BACKOFFICE_WEB_ORIGIN ?? "http://localhost:5174"],
  };
}

export function createBackofficeAuth(config: {
  databaseUrl: string;
  authSecret: string;
  trustedOrigins: string[];
}) {
  assertSafeBackofficeDatabaseUrl(config.databaseUrl);
  const client = postgres(config.databaseUrl);
  const db = drizzle(client);

  return betterAuth({
    appName: "QS Pro Backoffice",
    secret: config.authSecret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: boUsers,
        session: boSessions,
        account: boAccounts,
        verification: boVerifications,
        twoFactor: boTwoFactors,
      },
    }),
    emailAndPassword: { enabled: true },
    session: { expiresIn: 4 * 60 * 60 },
    plugins: [
      admin({ defaultRole: "viewer", adminRoles: ["admin"] }),
      twoFactor({ issuer: "QS Pro Backoffice" }),
    ],
    trustedOrigins: config.trustedOrigins,
    basePath: "/api/auth",
  });
}

let authInstance: ReturnType<typeof createBackofficeAuth> | null = null;

export function getAuth(): ReturnType<typeof createBackofficeAuth> {
  if (authInstance) {
    return authInstance;
  }

  authInstance = createBackofficeAuth(
    getBackofficeAuthConfigFromEnv(process.env),
  );
  return authInstance;
}

export type BackofficeAuth = ReturnType<typeof getAuth>;
export type BackofficeSession = BackofficeAuth["$Infer"]["Session"];
