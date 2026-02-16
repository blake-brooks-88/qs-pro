/**
 * RLS Isolation Regression Suite
 *
 * Verifies row-level security policies on ALL 10 tenant-scoped tables.
 * Tests the exact isolation scope per table:
 *   - tenant + mid + user: shell_query_runs, folders
 *   - tenant + mid: saved_queries, query_versions, query_publish_events, credentials, audit_logs
 *   - tenant-only: snippets, tenant_feature_overrides
 *
 * Also verifies:
 *   - FORCE ROW LEVEL SECURITY is enabled on all 10 protected tables
 *   - System tables (tenants, users, tenant_settings) do NOT have RLS
 *
 * Connects as qs_runtime role via DATABASE_URL (which has FORCE RLS applied).
 * Uses raw SQL with set_config to test policies in isolation from application logic.
 */
import type { Sql } from 'postgres';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- key is a trusted string literal
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

interface RlsContext {
  tenantId: string;
  mid: string;
  userId?: string;
}

type ReservedSql = Awaited<ReturnType<Sql['reserve']>>;

describe('RLS Isolation Regression Suite', () => {
  let sql: Sql;

  // --- Shared test identifiers ---
  const tenantAId = crypto.randomUUID();
  const tenantBId = crypto.randomUUID();
  const userA1Id = crypto.randomUUID();
  const userA2Id = crypto.randomUUID();
  const userB1Id = crypto.randomUUID();

  // --- RLS contexts ---
  const ctxA: RlsContext = {
    tenantId: tenantAId,
    mid: 'mid-rls-a',
    userId: userA1Id,
  };
  const ctxB: RlsContext = {
    tenantId: tenantBId,
    mid: 'mid-rls-b',
    userId: userB1Id,
  };
  const ctxA_diffMid: RlsContext = {
    tenantId: tenantAId,
    mid: 'mid-rls-a2',
    userId: userA1Id,
  };
  const ctxA_diffUser: RlsContext = {
    tenantId: tenantAId,
    mid: 'mid-rls-a',
    userId: userA2Id,
  };

  // --- Row IDs for test data ---
  const shellQueryRunAId = crypto.randomUUID();
  const folderAId = crypto.randomUUID();
  const savedQueryAId = crypto.randomUUID();
  const queryVersionAId = crypto.randomUUID();
  const queryPublishEventAId = crypto.randomUUID();
  const credentialAId = crypto.randomUUID();
  const auditLogAId = crypto.randomUUID();
  const snippetAId = crypto.randomUUID();
  const tenantFeatureOverrideAId = crypto.randomUUID();

  // Prerequisite rows in tenant B (FK targets for write protection tests)
  const savedQueryBId = crypto.randomUUID();
  const queryVersionBId = crypto.randomUUID();

  /**
   * Reserves a connection, sets RLS context via set_config, executes the
   * callback, then resets context and releases the connection.
   */
  async function withRlsContext<T>(
    ctx: RlsContext,
    fn: (conn: ReservedSql) => Promise<T>,
  ): Promise<T> {
    const reserved = await sql.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${ctx.tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${ctx.mid}, false)`;
      if (ctx.userId) {
        await reserved`SELECT set_config('app.user_id', ${ctx.userId}, false)`;
      }
      return await fn(reserved);
    } finally {
      try {
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
      } finally {
        reserved.release();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Setup & Teardown
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    sql = postgres(getRequiredEnv('DATABASE_URL'), { max: 5 });

    // tenants and users have NO RLS -- insert directly
    await sql`
      INSERT INTO tenants (id, eid, tssd)
      VALUES
        (${tenantAId}::uuid, ${'rls-reg-eid-a'}, ${'rls-reg-tssd-a'}),
        (${tenantBId}::uuid, ${'rls-reg-eid-b'}, ${'rls-reg-tssd-b'})
    `;
    await sql`
      INSERT INTO users (id, sf_user_id, tenant_id)
      VALUES
        (${userA1Id}::uuid, ${'rls-reg-sf-a1'}, ${tenantAId}::uuid),
        (${userA2Id}::uuid, ${'rls-reg-sf-a2'}, ${tenantAId}::uuid),
        (${userB1Id}::uuid, ${'rls-reg-sf-b1'}, ${tenantBId}::uuid)
    `;

    // Insert all tenant-A test rows (RLS-protected tables)
    await withRlsContext(ctxA, async (conn) => {
      await conn`
        INSERT INTO shell_query_runs (id, tenant_id, user_id, mid, sql_text_hash, status)
        VALUES (${shellQueryRunAId}::uuid, ${tenantAId}::uuid, ${userA1Id}::uuid, ${ctxA.mid}, 'rls-test-hash', 'queued')
      `;
      await conn`
        INSERT INTO folders (id, tenant_id, mid, user_id, name)
        VALUES (${folderAId}::uuid, ${tenantAId}::uuid, ${ctxA.mid}, ${userA1Id}::uuid, 'RLS Test Folder')
      `;
      await conn`
        INSERT INTO saved_queries (id, tenant_id, mid, user_id, name, sql_text_encrypted)
        VALUES (${savedQueryAId}::uuid, ${tenantAId}::uuid, ${ctxA.mid}, ${userA1Id}::uuid, 'RLS Test Query', 'encrypted-rls-test')
      `;
      await conn`
        INSERT INTO query_versions (id, saved_query_id, tenant_id, mid, user_id, sql_text_encrypted, sql_text_hash, line_count, source)
        VALUES (${queryVersionAId}::uuid, ${savedQueryAId}::uuid, ${tenantAId}::uuid, ${ctxA.mid}, ${userA1Id}::uuid, 'encrypted-v1', 'hash-v1', 1, 'save')
      `;
      await conn`
        INSERT INTO query_publish_events (id, saved_query_id, version_id, tenant_id, mid, user_id, linked_qa_customer_key, published_sql_hash)
        VALUES (${queryPublishEventAId}::uuid, ${savedQueryAId}::uuid, ${queryVersionAId}::uuid, ${tenantAId}::uuid, ${ctxA.mid}, ${userA1Id}::uuid, 'rls-test-qa-key', 'rls-test-sql-hash')
      `;
      await conn`
        INSERT INTO credentials (id, tenant_id, user_id, mid, access_token, refresh_token, expires_at)
        VALUES (${credentialAId}::uuid, ${tenantAId}::uuid, ${userA1Id}::uuid, ${ctxA.mid}, 'rls-test-access', 'rls-test-refresh', NOW() + INTERVAL '1 hour')
      `;
      await conn`
        INSERT INTO audit_logs (id, tenant_id, mid, event_type, actor_type, actor_id)
        VALUES (${auditLogAId}::uuid, ${tenantAId}::uuid, ${ctxA.mid}, 'test.rls_check', 'user', ${userA1Id}::uuid)
      `;
      await conn`
        INSERT INTO snippets (id, user_id, tenant_id, title, code)
        VALUES (${snippetAId}::uuid, ${userA1Id}::uuid, ${tenantAId}::uuid, 'RLS Test Snippet', 'SELECT 1')
      `;
      await conn`
        INSERT INTO tenant_feature_overrides (id, tenant_id, feature_key, enabled)
        VALUES (${tenantFeatureOverrideAId}::uuid, ${tenantAId}::uuid, 'rls_test_feature', true)
      `;
    });

    // Insert tenant-B prerequisite rows (FK targets for write protection tests)
    await withRlsContext(ctxB, async (conn) => {
      await conn`
        INSERT INTO saved_queries (id, tenant_id, mid, user_id, name, sql_text_encrypted)
        VALUES (${savedQueryBId}::uuid, ${tenantBId}::uuid, ${ctxB.mid}, ${userB1Id}::uuid, 'RLS Test Query B', 'encrypted-rls-b')
      `;
      await conn`
        INSERT INTO query_versions (id, saved_query_id, tenant_id, mid, user_id, sql_text_encrypted, sql_text_hash, line_count, source)
        VALUES (${queryVersionBId}::uuid, ${savedQueryBId}::uuid, ${tenantBId}::uuid, ${ctxB.mid}, ${userB1Id}::uuid, 'encrypted-v1-b', 'hash-v1-b', 1, 'save')
      `;
    });
  });

  afterAll(async () => {
    try {
      // Clean up RLS-protected tables in reverse FK order.
      // Each block catches errors to ensure cleanup continues even if
      // one table's deletion fails (e.g., due to RLS context mismatch).

      const cleanupContexts: Array<{ ctx: RlsContext; tenantId: string }> = [
        { ctx: ctxA, tenantId: tenantAId },
        { ctx: ctxB, tenantId: tenantBId },
      ];

      for (const { ctx, tenantId } of cleanupContexts) {
        try {
          await withRlsContext(ctx, async (conn) => {
            await conn`DELETE FROM query_publish_events WHERE tenant_id = ${tenantId}::uuid`;
            await conn`DELETE FROM query_versions WHERE tenant_id = ${tenantId}::uuid`;
            await conn`DELETE FROM shell_query_runs WHERE tenant_id = ${tenantId}::uuid`;
            await conn`DELETE FROM saved_queries WHERE tenant_id = ${tenantId}::uuid`;
            await conn`DELETE FROM folders WHERE tenant_id = ${tenantId}::uuid`;
            await conn`DELETE FROM credentials WHERE tenant_id = ${tenantId}::uuid`;
            await conn`DELETE FROM snippets WHERE tenant_id = ${tenantId}::uuid`;
            await conn`DELETE FROM tenant_feature_overrides WHERE tenant_id = ${tenantId}::uuid`;
          });
        } catch {
          // Best effort -- global-setup purge handles orphans
        }
      }

      // audit_logs: immutability trigger blocks direct DELETE unless the
      // session flag app.audit_retention_purge is set to 'on'. Must be
      // deleted before tenants because ON DELETE CASCADE would be blocked
      // by FORCE RLS (qs_runtime can't see the cascaded rows without context).
      try {
        await withRlsContext(ctxA, async (conn) => {
          await conn`SELECT set_config('app.audit_retention_purge', 'on', false)`;
          await conn`DELETE FROM audit_logs WHERE tenant_id = ${tenantAId}::uuid`;
          await conn`SELECT set_config('app.audit_retention_purge', '', false)`;
        });
      } catch {
        // Best effort -- global-setup purge handles orphans
      }

      // tenants/users have NO RLS -- delete directly.
      // Tenants may fail if audit_logs rows weren't fully cleaned (FORCE RLS
      // + immutability trigger). The global-setup purge (privileged connection)
      // handles orphans, so swallow errors here.
      await sql`DELETE FROM users WHERE id = ANY(${[userA1Id, userA2Id, userB1Id]}::uuid[])`;
      try {
        await sql`DELETE FROM tenants WHERE id = ANY(${[tenantAId, tenantBId]}::uuid[])`;
      } catch {
        // Global purge will handle orphaned tenants
      }
    } finally {
      await sql.end();
    }
  });

  // ---------------------------------------------------------------------------
  // 1. shell_query_runs (tenant + mid + user isolation)
  // ---------------------------------------------------------------------------

  describe('shell_query_runs (tenant + mid + user)', () => {
    it('should block cross-tenant read access', async () => {
      const rows = await withRlsContext(ctxB, async (conn) => {
        return conn`SELECT id FROM shell_query_runs WHERE id = ${shellQueryRunAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should block same-tenant cross-BU read access', async () => {
      const rows = await withRlsContext(ctxA_diffMid, async (conn) => {
        return conn`SELECT id FROM shell_query_runs WHERE id = ${shellQueryRunAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should block same-BU cross-user read access', async () => {
      const rows = await withRlsContext(ctxA_diffUser, async (conn) => {
        return conn`SELECT id FROM shell_query_runs WHERE id = ${shellQueryRunAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should reject INSERT violating WITH CHECK policy', async () => {
      await expect(
        withRlsContext(ctxB, async (conn) => {
          const id = crypto.randomUUID();
          await conn`
            INSERT INTO shell_query_runs (id, tenant_id, user_id, mid, sql_text_hash, status)
            VALUES (${id}::uuid, ${tenantAId}::uuid, ${userA1Id}::uuid, ${ctxA.mid}, 'bad-hash', 'queued')
          `;
        }),
      ).rejects.toThrow(/new row violates row-level security/);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. folders (tenant + mid + user isolation)
  // ---------------------------------------------------------------------------

  describe('folders (tenant + mid + user)', () => {
    it('should block cross-tenant read access', async () => {
      const rows = await withRlsContext(ctxB, async (conn) => {
        return conn`SELECT id FROM folders WHERE id = ${folderAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should block same-tenant cross-BU read access', async () => {
      const rows = await withRlsContext(ctxA_diffMid, async (conn) => {
        return conn`SELECT id FROM folders WHERE id = ${folderAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should block same-BU cross-user read access', async () => {
      const rows = await withRlsContext(ctxA_diffUser, async (conn) => {
        return conn`SELECT id FROM folders WHERE id = ${folderAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should reject INSERT violating WITH CHECK policy', async () => {
      await expect(
        withRlsContext(ctxB, async (conn) => {
          const id = crypto.randomUUID();
          await conn`
            INSERT INTO folders (id, tenant_id, mid, user_id, name)
            VALUES (${id}::uuid, ${tenantAId}::uuid, ${ctxA.mid}, ${userA1Id}::uuid, 'Bad Folder')
          `;
        }),
      ).rejects.toThrow(/new row violates row-level security/);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. saved_queries (tenant + mid isolation)
  // ---------------------------------------------------------------------------

  describe('saved_queries (tenant + mid)', () => {
    it('should block cross-tenant read access', async () => {
      const rows = await withRlsContext(ctxB, async (conn) => {
        return conn`SELECT id FROM saved_queries WHERE id = ${savedQueryAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should block same-tenant cross-BU read access', async () => {
      const rows = await withRlsContext(ctxA_diffMid, async (conn) => {
        return conn`SELECT id FROM saved_queries WHERE id = ${savedQueryAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should ALLOW same-BU cross-user read access', async () => {
      const rows = await withRlsContext(ctxA_diffUser, async (conn) => {
        return conn`SELECT id FROM saved_queries WHERE id = ${savedQueryAId}::uuid`;
      });
      expect(rows).toHaveLength(1);
    });

    it('should reject INSERT violating WITH CHECK policy', async () => {
      await expect(
        withRlsContext(ctxB, async (conn) => {
          const id = crypto.randomUUID();
          await conn`
            INSERT INTO saved_queries (id, tenant_id, mid, user_id, name, sql_text_encrypted)
            VALUES (${id}::uuid, ${tenantAId}::uuid, ${ctxA.mid}, ${userA1Id}::uuid, 'Bad Query', 'encrypted')
          `;
        }),
      ).rejects.toThrow(/new row violates row-level security/);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. query_versions (tenant + mid isolation)
  // ---------------------------------------------------------------------------

  describe('query_versions (tenant + mid)', () => {
    it('should block cross-tenant read access', async () => {
      const rows = await withRlsContext(ctxB, async (conn) => {
        return conn`SELECT id FROM query_versions WHERE id = ${queryVersionAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should block same-tenant cross-BU read access', async () => {
      const rows = await withRlsContext(ctxA_diffMid, async (conn) => {
        return conn`SELECT id FROM query_versions WHERE id = ${queryVersionAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should ALLOW same-BU cross-user read access', async () => {
      const rows = await withRlsContext(ctxA_diffUser, async (conn) => {
        return conn`SELECT id FROM query_versions WHERE id = ${queryVersionAId}::uuid`;
      });
      expect(rows).toHaveLength(1);
    });

    it('should reject INSERT violating WITH CHECK policy', async () => {
      await expect(
        withRlsContext(ctxB, async (conn) => {
          const id = crypto.randomUUID();
          // Use tenant B's saved_query as FK target (visible in B's context)
          // but set tenant_id to A -- WITH CHECK rejects the mismatch
          await conn`
            INSERT INTO query_versions (id, saved_query_id, tenant_id, mid, user_id, sql_text_encrypted, sql_text_hash, line_count, source)
            VALUES (${id}::uuid, ${savedQueryBId}::uuid, ${tenantAId}::uuid, ${ctxA.mid}, ${userA1Id}::uuid, 'enc', 'hash', 1, 'save')
          `;
        }),
      ).rejects.toThrow(/new row violates row-level security/);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. query_publish_events (tenant + mid isolation)
  // ---------------------------------------------------------------------------

  describe('query_publish_events (tenant + mid)', () => {
    it('should block cross-tenant read access', async () => {
      const rows = await withRlsContext(ctxB, async (conn) => {
        return conn`SELECT id FROM query_publish_events WHERE id = ${queryPublishEventAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should block same-tenant cross-BU read access', async () => {
      const rows = await withRlsContext(ctxA_diffMid, async (conn) => {
        return conn`SELECT id FROM query_publish_events WHERE id = ${queryPublishEventAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should ALLOW same-BU cross-user read access', async () => {
      const rows = await withRlsContext(ctxA_diffUser, async (conn) => {
        return conn`SELECT id FROM query_publish_events WHERE id = ${queryPublishEventAId}::uuid`;
      });
      expect(rows).toHaveLength(1);
    });

    it('should reject INSERT violating WITH CHECK policy', async () => {
      await expect(
        withRlsContext(ctxB, async (conn) => {
          const id = crypto.randomUUID();
          // Use tenant B's saved_query and version as FK targets
          await conn`
            INSERT INTO query_publish_events (id, saved_query_id, version_id, tenant_id, mid, user_id, linked_qa_customer_key, published_sql_hash)
            VALUES (${id}::uuid, ${savedQueryBId}::uuid, ${queryVersionBId}::uuid, ${tenantAId}::uuid, ${ctxA.mid}, ${userA1Id}::uuid, 'bad-key', 'bad-hash')
          `;
        }),
      ).rejects.toThrow(/new row violates row-level security/);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. credentials (tenant + mid isolation)
  // ---------------------------------------------------------------------------

  describe('credentials (tenant + mid)', () => {
    it('should block cross-tenant read access', async () => {
      const rows = await withRlsContext(ctxB, async (conn) => {
        return conn`SELECT id FROM credentials WHERE id = ${credentialAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should block same-tenant cross-BU read access', async () => {
      const rows = await withRlsContext(ctxA_diffMid, async (conn) => {
        return conn`SELECT id FROM credentials WHERE id = ${credentialAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should ALLOW same-BU cross-user read access', async () => {
      const rows = await withRlsContext(ctxA_diffUser, async (conn) => {
        return conn`SELECT id FROM credentials WHERE id = ${credentialAId}::uuid`;
      });
      expect(rows).toHaveLength(1);
    });

    it('should reject INSERT violating WITH CHECK policy', async () => {
      await expect(
        withRlsContext(ctxB, async (conn) => {
          const id = crypto.randomUUID();
          await conn`
            INSERT INTO credentials (id, tenant_id, user_id, mid, access_token, refresh_token, expires_at)
            VALUES (${id}::uuid, ${tenantAId}::uuid, ${userA1Id}::uuid, ${ctxA.mid}, 'bad-token', 'bad-refresh', NOW() + INTERVAL '1 hour')
          `;
        }),
      ).rejects.toThrow(/new row violates row-level security/);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. audit_logs (tenant + mid isolation)
  // ---------------------------------------------------------------------------

  describe('audit_logs (tenant + mid)', () => {
    it('should block cross-tenant read access', async () => {
      const rows = await withRlsContext(ctxB, async (conn) => {
        return conn`SELECT id FROM audit_logs WHERE id = ${auditLogAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should block same-tenant cross-BU read access', async () => {
      const rows = await withRlsContext(ctxA_diffMid, async (conn) => {
        return conn`SELECT id FROM audit_logs WHERE id = ${auditLogAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should ALLOW same-BU cross-user read access', async () => {
      const rows = await withRlsContext(ctxA_diffUser, async (conn) => {
        return conn`SELECT id FROM audit_logs WHERE id = ${auditLogAId}::uuid`;
      });
      expect(rows).toHaveLength(1);
    });

    it('should reject INSERT violating WITH CHECK policy', async () => {
      await expect(
        withRlsContext(ctxB, async (conn) => {
          const id = crypto.randomUUID();
          await conn`
            INSERT INTO audit_logs (id, tenant_id, mid, event_type, actor_type)
            VALUES (${id}::uuid, ${tenantAId}::uuid, ${ctxA.mid}, 'test.bad', 'user')
          `;
        }),
      ).rejects.toThrow(/new row violates row-level security/);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. snippets (tenant-only isolation)
  // ---------------------------------------------------------------------------

  describe('snippets (tenant-only)', () => {
    it('should block cross-tenant read access', async () => {
      const rows = await withRlsContext(ctxB, async (conn) => {
        return conn`SELECT id FROM snippets WHERE id = ${snippetAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should ALLOW same-tenant cross-BU read access', async () => {
      const rows = await withRlsContext(ctxA_diffMid, async (conn) => {
        return conn`SELECT id FROM snippets WHERE id = ${snippetAId}::uuid`;
      });
      expect(rows).toHaveLength(1);
    });

    it('should reject INSERT violating WITH CHECK policy', async () => {
      await expect(
        withRlsContext(ctxB, async (conn) => {
          const id = crypto.randomUUID();
          await conn`
            INSERT INTO snippets (id, user_id, tenant_id, title, code)
            VALUES (${id}::uuid, ${userA1Id}::uuid, ${tenantAId}::uuid, 'Bad Snippet', 'SELECT 1')
          `;
        }),
      ).rejects.toThrow(/new row violates row-level security/);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. tenant_feature_overrides (tenant-only isolation)
  // ---------------------------------------------------------------------------

  describe('tenant_feature_overrides (tenant-only)', () => {
    it('should block cross-tenant read access', async () => {
      const rows = await withRlsContext(ctxB, async (conn) => {
        return conn`SELECT id FROM tenant_feature_overrides WHERE id = ${tenantFeatureOverrideAId}::uuid`;
      });
      expect(rows).toHaveLength(0);
    });

    it('should ALLOW same-tenant cross-BU read access', async () => {
      const rows = await withRlsContext(ctxA_diffMid, async (conn) => {
        return conn`SELECT id FROM tenant_feature_overrides WHERE id = ${tenantFeatureOverrideAId}::uuid`;
      });
      expect(rows).toHaveLength(1);
    });

    it('should reject INSERT violating WITH CHECK policy', async () => {
      await expect(
        withRlsContext(ctxB, async (conn) => {
          const id = crypto.randomUUID();
          await conn`
            INSERT INTO tenant_feature_overrides (id, tenant_id, feature_key, enabled)
            VALUES (${id}::uuid, ${tenantAId}::uuid, 'bad_feature', true)
          `;
        }),
      ).rejects.toThrow(/new row violates row-level security/);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. FORCE RLS verification
  // ---------------------------------------------------------------------------

  describe('FORCE RLS verification', () => {
    const PROTECTED_TABLES = [
      'shell_query_runs',
      'folders',
      'saved_queries',
      'query_versions',
      'query_publish_events',
      'credentials',
      'audit_logs',
      'snippets',
      'tenant_feature_overrides',
    ];

    it('should have FORCE RLS enabled on all tenant-scoped tables', async () => {
      // relkind 'r' = regular table, 'p' = partitioned table (audit_logs)
      const result = await sql`
        SELECT relname, relforcerowsecurity
        FROM pg_catalog.pg_class
        WHERE relname = ANY(${PROTECTED_TABLES})
          AND relkind IN ('r', 'p')
      `;

      const tableMap = new Map(
        result.map((row) => [
          row.relname as string,
          row.relforcerowsecurity as boolean,
        ]),
      );

      for (const table of PROTECTED_TABLES) {
        const hasForceRls = tableMap.get(table);
        expect(hasForceRls, `${table} should have FORCE RLS enabled`).toBe(
          true,
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 11. System tables -- negative assertion
  // ---------------------------------------------------------------------------

  describe('System tables (no RLS)', () => {
    it('should NOT have RLS on system tables (tenants, users, tenant_settings)', async () => {
      const SYSTEM_TABLES = ['tenants', 'users', 'tenant_settings'];

      const result = await sql`
        SELECT relname, relrowsecurity
        FROM pg_catalog.pg_class
        WHERE relname = ANY(${SYSTEM_TABLES})
          AND relkind IN ('r', 'p')
      `;

      const tableMap = new Map(
        result.map((row) => [
          row.relname as string,
          row.relrowsecurity as boolean,
        ]),
      );

      // tenants: Accessed by auth flow before tenant context is established
      expect(
        tableMap.get('tenants'),
        'tenants should NOT have RLS (accessed by auth flow before tenant context)',
      ).toBe(false);

      // users: Accessed by auth flow before user context is established
      expect(
        tableMap.get('users'),
        'users should NOT have RLS (accessed by auth flow before user context)',
      ).toBe(false);

      // tenant_settings: Accessed by MCE services that need folder IDs before full RLS context
      expect(
        tableMap.get('tenant_settings'),
        'tenant_settings should NOT have RLS (accessed before full RLS context for folder IDs)',
      ).toBe(false);
    });
  });
});
