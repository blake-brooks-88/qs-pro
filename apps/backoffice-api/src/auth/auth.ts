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

const databaseUrl = process.env.DATABASE_URL_BACKOFFICE;
if (!databaseUrl) {
  throw new Error("DATABASE_URL_BACKOFFICE is required");
}
assertSafeBackofficeDatabaseUrl(databaseUrl);
const client = postgres(databaseUrl);
const db = drizzle(client);

export const auth = betterAuth({
  appName: "QS Pro Backoffice",
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
  trustedOrigins: [
    process.env.BACKOFFICE_WEB_ORIGIN ?? "http://localhost:5174",
  ],
  basePath: "/api/auth",
});

export type BackofficeSession = typeof auth.$Infer.Session;
