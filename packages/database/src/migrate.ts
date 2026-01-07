/* eslint-disable no-console */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as dotenv from "dotenv";
import path from "path";
import fs from "node:fs";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
];
for (const envPath of envCandidates) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const connectionString =
  process.env.DATABASE_URL_MIGRATIONS ||
  process.env.DATABASE_URL ||
  "postgres://postgres:password@localhost:5432/qs_pro";

async function runMigrations() {
  console.log("⏳ Connecting to database...");
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  console.log("⏳ Running migrations from drizzle/ folder...");

  await migrate(db, {
    migrationsFolder: path.join(__dirname, "../drizzle"),
  });

  console.log("✅ Migrations completed!");

  await sql.end();
}

runMigrations().catch((err) => {
  console.error("❌ Migration failed!");
  console.error(err);
  process.exit(1);
});
