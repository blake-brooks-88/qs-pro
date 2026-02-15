import * as dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: "../../.env" });

const BATCH_SIZE = 10_000;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL_MIGRATIONS or DATABASE_URL must be set");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });

  try {
    await sql`SELECT set_config('app.audit_retention_purge', 'on', false)`;

    let totalDeleted = 0;
    let batchDeleted: number;

    do {
      const result = await sql`
        WITH expired AS (
          SELECT a.ctid
          FROM audit_logs a
          JOIN tenants t ON t.id = a.tenant_id
          WHERE a.created_at < now() - make_interval(days => COALESCE(t.audit_retention_days, 365))
          LIMIT ${BATCH_SIZE}
        )
        DELETE FROM audit_logs
        WHERE ctid IN (SELECT ctid FROM expired)
      `;

      batchDeleted = result.count;
      totalDeleted += batchDeleted;

      if (batchDeleted > 0) {
        console.log(
          `Deleted batch of ${batchDeleted} expired audit rows (total: ${totalDeleted})`,
        );
      }
    } while (batchDeleted > 0);

    console.log(
      `Audit retention purge complete. Total deleted: ${totalDeleted}`,
    );
  } finally {
    await sql`SELECT set_config('app.audit_retention_purge', 'off', false)`;
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Audit retention purge failed:", err);
  process.exit(1);
});
