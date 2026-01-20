# PR #7 Security & Reliability Fixes Design

**Date:** 2026-01-16
**Status:** Ready for Implementation
**PR:** #7 - Query Execution Flow

## Summary

This document outlines fixes for security vulnerabilities and reliability issues identified in PR #7's code review. The PR implements end-to-end query execution (web → API → worker) with SSE status streaming.

## Critical Fixes

### 1. PII Leakage in Logs

**Problem:** Sensitive customer data logged in two locations:
- `apps/api/src/shell-query/shell-query.service.ts:187` - Logs full MCE rowset response
- `apps/worker/src/shell-query/strategies/run-to-temp.strategy.ts:70` - Logs expanded SQL

**Fix:** Log only structural metadata, never actual data.

```typescript
// shell-query.service.ts:187
// Before:
this.logger.debug(`MCE rowset response: ${JSON.stringify(mceResponse)}`);
// After:
this.logger.debug(`MCE rowset response: count=${mceResponse.count ?? 0}, page=${mceResponse.page ?? 1}`);

// run-to-temp.strategy.ts:70
// Before:
this.logger.debug(`Expanded SELECT * query: ${expandedSql}`);
// After:
this.logger.debug(`Expanded SELECT * query (length=${expandedSql.length})`);
```

**References:**
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP Top 10:2025 A09](https://owasp.org/Top10/2025/A09_2025-Security_Logging_and_Alerting_Failures/)

---

### 2. IDOR Vulnerability / Access Control

**Problem:** Run lookups constrain by `tenantId` only, not `userId`. Any user in the same tenant who learns a `runId` can read status/results/stream events and cancel runs. No RLS policy on `shell_query_runs` table.

**Decision:** Strict per-user isolation (only creator can view/cancel).

**Fix - Application Layer:**

```typescript
// drizzle-shell-query-run.repository.ts

async findRun(runId: string, tenantId: string, userId: string): Promise<ShellQueryRun | null> {
  const results = await this.db
    .select()
    .from(shellQueryRuns)
    .where(
      and(
        eq(shellQueryRuns.id, runId),
        eq(shellQueryRuns.tenantId, tenantId),
        eq(shellQueryRuns.userId, userId),  // Add userId constraint
      ),
    );
  return results[0] ?? null;
}

async markCanceled(runId: string, tenantId: string, mid: string, userId: string): Promise<void> {
  await this.rlsContext.runWithTenantContext(tenantId, mid, async () => {
    await this.db
      .update(shellQueryRuns)
      .set({ status: 'canceled', completedAt: new Date() })
      .where(
        and(
          eq(shellQueryRuns.id, runId),
          eq(shellQueryRuns.userId, userId),  // Add userId constraint
        ),
      );
  });
}
```

Update interface and all callers to pass `userId` through the chain:
- `ShellQueryRunRepository` interface
- `ShellQueryService.getRun()`, `getRunStatus()`, `getResults()`, `cancelRun()`
- `ShellQueryController` (already has userId via `@CurrentUser()`)

**Fix - Database Layer (Defense in Depth):**

**IMPORTANT: Use Drizzle CLI to generate the migration - do NOT manually create migration files.**

Steps:
1. Create a custom SQL migration using the Drizzle CLI:
   ```bash
   cd packages/database
   pnpm drizzle-kit generate --custom --name=rls_shell_query_runs
   ```

2. This creates a properly journaled migration file. Edit the generated `.sql` file with:

   ```sql
   -- Enable RLS on shell_query_runs
   ALTER TABLE "shell_query_runs" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "shell_query_runs" FORCE ROW LEVEL SECURITY;

   -- Strict per-user isolation (tenant + user)
   DROP POLICY IF EXISTS "shell_query_runs_user_isolation" ON "shell_query_runs";
   CREATE POLICY "shell_query_runs_user_isolation"
     ON "shell_query_runs"
     USING (
       "tenant_id"::text = current_setting('app.tenant_id', true)
       AND "user_id"::text = current_setting('app.user_id', true)
     )
     WITH CHECK (
       "tenant_id"::text = current_setting('app.tenant_id', true)
       AND "user_id"::text = current_setting('app.user_id', true)
     );
   ```

3. Run the migration:
   ```bash
   pnpm db:migrate
   ```

This ensures the `drizzle/meta/_journal.json` stays in sync and migrations are properly tracked.

---

### 2b. RLS Context Gap: Adding `app.user_id` Support

**Problem:** The proposed RLS policy requires `current_setting('app.user_id', true)`, but today the DB contexts only set `app.tenant_id` + `app.mid`. Additionally, some repository methods (`findRun`, `countActiveRuns`) don't use RLS context at all - they query directly, which will fail under `FORCE ROW LEVEL SECURITY`.

**Current State:**

| Method | Uses RLS Context? | Will Break Under Forced RLS? |
|--------|-------------------|------------------------------|
| `createRun()` | Yes (tenant+mid only) | Yes - missing user_id |
| `findRun()` | No | Yes - no context set |
| `markCanceled()` | Yes (tenant+mid only) | Yes - missing user_id |
| `countActiveRuns()` | No | Yes - no context set |

**Fix - Update RlsContextService:**

```typescript
// apps/api/src/database/rls-context.service.ts

async runWithTenantContext<T>(
  tenantId: string,
  mid: string,
  fn: () => Promise<T>,
): Promise<T> {
  // ... existing implementation
}

// New method with full context including userId
async runWithUserContext<T>(
  tenantId: string,
  mid: string,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = getDbFromContext();
  if (existing) {
    return fn();
  }

  const reserved = await this.sql.reserve();
  try {
    await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
    await reserved`SELECT set_config('app.mid', ${mid}, false)`;
    await reserved`SELECT set_config('app.user_id', ${userId}, false)`;

    const db = createDatabaseFromClient(
      this.makeDrizzleCompatibleSql(reserved),
    );

    return await runWithDbContext(db, fn);
  } catch (error) {
    this.logger.error(
      'Failed to run with user context',
      error instanceof Error ? error.stack : String(error),
    );
    throw error;
  } finally {
    try {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
    } catch {
      // Best-effort cleanup
    }
    reserved.release();
  }
}
```

**Fix - Update Repository to Use RLS Context Everywhere:**

```typescript
// apps/api/src/shell-query/drizzle-shell-query-run.repository.ts

async createRun(params: CreateShellQueryRunParams): Promise<void> {
  await this.rlsContext.runWithUserContext(
    params.tenantId,
    params.mid,
    params.userId,  // Now passing userId
    async () => {
      await this.db.insert(shellQueryRuns).values({...});
    },
  );
}

async findRun(
  runId: string,
  tenantId: string,
  mid: string,      // New param
  userId: string,   // New param
): Promise<ShellQueryRun | null> {
  return this.rlsContext.runWithUserContext(tenantId, mid, userId, async () => {
    const results = await this.db
      .select()
      .from(shellQueryRuns)
      .where(
        and(
          eq(shellQueryRuns.id, runId),
          eq(shellQueryRuns.tenantId, tenantId),
          eq(shellQueryRuns.userId, userId),
        ),
      );
    return results[0] ?? null;
  });
}

async markCanceled(
  runId: string,
  tenantId: string,
  mid: string,
  userId: string,   // New param
): Promise<void> {
  await this.rlsContext.runWithUserContext(tenantId, mid, userId, async () => {
    await this.db
      .update(shellQueryRuns)
      .set({ status: 'canceled', completedAt: new Date() })
      .where(
        and(
          eq(shellQueryRuns.id, runId),
          eq(shellQueryRuns.userId, userId),
        ),
      );
  });
}

async countActiveRuns(
  tenantId: string,  // New param
  mid: string,       // New param
  userId: string,
): Promise<number> {
  return this.rlsContext.runWithUserContext(tenantId, mid, userId, async () => {
    const result = await this.db
      .select({ count: count() })
      .from(shellQueryRuns)
      .where(
        and(
          eq(shellQueryRuns.userId, userId),
          notInArray(shellQueryRuns.status, ['ready', 'failed', 'canceled']),
        ),
      );
    return result[0]?.count ?? 0;
  });
}
```

**Fix - Update Service Layer:**

All service methods need to pass the additional parameters:

```typescript
// apps/api/src/shell-query/shell-query.service.ts

async createRun(context: ShellQueryContext, sqlText: string, snippetName?: string): Promise<string> {
  // countActiveRuns now needs full context
  const activeRuns = await this.runRepo.countActiveRuns(
    context.tenantId,
    context.mid,
    context.userId,
  );
  // ... rest unchanged
}

async getRun(runId: string, tenantId: string, mid: string, userId: string) {
  return this.runRepo.findRun(runId, tenantId, mid, userId);
}

// Update getRunStatus, getResults, cancelRun similarly
```

**Fix - Worker's backend-shared RlsContextService:**

The worker package also has its own `RlsContextService` in `@qpp/backend-shared`. It needs the same `runWithUserContext` method added.

**Testing Considerations:**

1. **Unit tests**: Mock RLS context and verify all methods call `runWithUserContext`
2. **Integration tests**:
   - Create run as User A
   - Attempt to read/cancel as User B in same tenant → should fail
   - Verify `countActiveRuns` returns correct count per user
3. **Migration rollback**: If RLS policy is applied before code is deployed, queries will fail. Deploy code first, then run migration.

**References:**
- [OWASP IDOR Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
- [AWS RLS Best Practices](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html)
- [Crunchy Data RLS Guide](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)

---

### 3. ENT. Table Handling Bug

**Problem:** In `query-analyzer.ts:159-173`, `effectiveTableName` strips the `ENT.` prefix but metadata fetch still uses the original name with prefix.

**Fix:**

```typescript
// query-analyzer.ts - getFieldsForTable function

async function getFieldsForTable(
  tableName: string,
  metadataFn: MetadataFetcher,
): Promise<FieldDefinition[]> {
  const normalized = normalizeTableName(tableName);

  let effectiveTableName = normalized;
  if (normalized.toLowerCase().startsWith("ent.")) {
    effectiveTableName = normalized.substring(4);
  }

  if (isSystemDataView(effectiveTableName)) {
    const fields = getSystemDataViewFields(effectiveTableName);
    return fields.map((f: DataViewField) => ({
      Name: f.Name,
      FieldType: f.FieldType,
      MaxLength: f.MaxLength,
    }));
  }

  // Fix: Use effectiveTableName for metadata fetch
  const fields = await metadataFn.getFieldsForTable(effectiveTableName);
  if (!fields) {
    throw new SelectStarExpansionError(
      `Unable to expand SELECT *. Metadata unavailable for table ${effectiveTableName}. Try listing columns explicitly.`,
    );
  }

  return fields;
}
```

Same fix needed in `schema-inferrer.ts` `lookupFieldType` function.

---

### 4. Schema Inference - Frontend Metadata Passing

**Problem:** Worker redundantly fetches metadata from MCE that frontend already has cached. Metadata fetch failures cause schema inference to fail with silent fallback that creates mismatched DE columns.

**Decision:** Pass metadata from frontend; fail fast on parse errors.

**Fix - Shared Types:**

```typescript
// packages/shared-types/src/shell-query.ts

export interface TableMetadata {
  [tableName: string]: FieldDefinition[];
}

export interface FieldDefinition {
  Name: string;
  FieldType: string;
  MaxLength?: number;
}

export interface CreateRunRequest {
  sqlText: string;
  snippetName?: string;
  tableMetadata?: TableMetadata;
}
```

**Fix - Frontend:**

```typescript
// apps/web/src/features/editor-workspace/hooks/use-query-execution.ts

const execute = useCallback(async (sqlText: string, snippetName?: string) => {
  // Build metadata payload from cached data
  const tableNames = extractTableNames(sqlText);
  const tableMetadata: TableMetadata = {};

  for (const tableName of tableNames) {
    const cached = metadataCache.getFieldsForTable(tableName);
    if (cached) {
      tableMetadata[tableName] = cached;
    }
  }

  const response = await api.post<{ runId: string; status: QueryExecutionStatus }>(
    "/runs",
    { sqlText, snippetName, tableMetadata }
  );
  // ... rest of existing logic
}, [metadataCache, ...]);
```

**Fix - API Controller:**

```typescript
// apps/api/src/shell-query/shell-query.controller.ts

const createRunSchema = z.object({
  sqlText: z.string().min(1).max(100_000),
  snippetName: z.string().max(100).optional(),
  tableMetadata: z.record(
    z.string(),
    z.array(z.object({
      Name: z.string(),
      FieldType: z.string(),
      MaxLength: z.number().optional(),
    }))
  ).optional(),
});
```

**Fix - Worker:**

```typescript
// apps/worker/src/shell-query/strategies/run-to-temp.strategy.ts

private createMetadataFetcher(job: ShellQueryJob): MetadataFetcher {
  const { tenantId, userId, mid, tableMetadata } = job;

  return {
    getFieldsForTable: async (tableName: string): Promise<FieldDefinition[] | null> => {
      // 1. Check provided metadata first
      const normalizedName = this.normalizeTableName(tableName);
      const provided = tableMetadata?.[tableName] ?? tableMetadata?.[normalizedName];
      if (provided && provided.length > 0) {
        this.logger.debug(`Using provided metadata for ${tableName}`);
        return provided;
      }

      // 2. Fallback to MCE fetch
      this.logger.debug(`Fetching metadata from MCE for ${tableName}`);
      return this.fetchMetadataFromMce(tenantId, userId, mid, tableName);
    },
  };
}
```

**Fix - Schema Inferrer (fail fast):**

```typescript
// apps/worker/src/shell-query/schema-inferrer.ts

export class SchemaInferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaInferenceError";
  }
}

export async function inferSchema(
  sqlText: string,
  metadataFn: MetadataFetcher,
): Promise<ColumnDefinition[]> {
  let ast;
  try {
    ast = parser.astify(sqlText, { database: DIALECT });
  } catch (parseError) {
    throw new SchemaInferenceError(
      "Could not parse query to infer output columns. Use explicit column names instead of SELECT *."
    );
  }

  // ... inference logic ...

  if (columns.length === 0) {
    throw new SchemaInferenceError(
      "Could not determine output columns. Use explicit column names in your SELECT statement."
    );
  }

  return columns;
}
```

**Fix - Remove fallback in strategy:**

```typescript
// apps/worker/src/shell-query/strategies/run-to-temp.strategy.ts

private buildFieldsXml(schema: ColumnDefinition[]): string {
  if (schema.length === 0) {
    throw new Error(
      "Internal error: schema inference returned empty array. This should not happen."
    );
  }
  // ... existing field generation logic
}
```

---

### 5. Multi-Table SELECT * Handling

**Decision:** Reject with actionable error when SELECT * is used with multiple tables.

**Fix:**

```typescript
// apps/worker/src/shell-query/query-analyzer.ts - expandSelectStar function

export async function expandSelectStar(
  sqlText: string,
  metadataFn: MetadataFetcher,
): Promise<string> {
  // ... existing parsing ...

  for (const stmt of statements) {
    if (stmt.type !== "select") continue;
    if (!hasSelectStar(stmt.columns)) continue;

    const tables = extractTablesFromFrom(stmt.from ?? null);

    // New: Reject ambiguous SELECT *
    const starTablePrefix = getStarTablePrefix(stmt.columns);
    if (!starTablePrefix && tables.length > 1) {
      throw new SelectStarExpansionError(
        `SELECT * with multiple tables is ambiguous. Use table.* (e.g., ${tables[0]}.* ) or list columns explicitly.`
      );
    }

    // ... rest of existing logic
  }
}
```

---

## Suggestions (Nice to Have)

### 6. DE Naming Collision Risk

**Problem:** `runId.substring(0, 4)` = 65,536 combinations. Birthday paradox gives 50% collision after ~250 runs.

**Fix:** Use 8 characters (4.3 billion combinations).

```typescript
// run-to-temp.strategy.ts:47 and shell-query.service.ts:169
const hash = runId.substring(0, 8);  // Was: substring(0, 4)
```

---

### 7. Input Validation

**Fix:** Already included in Section 4 - add max length to sqlText (100KB).

---

### 8. Frontend Error Handling

**Fix - Debounce SSE error toasts:**

```typescript
// use-query-execution.ts

const hasShownErrorRef = useRef(false);

const subscribeToSSE = useCallback((targetRunId: string) => {
  closeEventSource();
  hasShownErrorRef.current = false;

  const eventSource = new EventSource(`/api/runs/${targetRunId}/events`, {
    withCredentials: true,
  });

  eventSource.onmessage = (event: MessageEvent) => {
    hasShownErrorRef.current = false;  // Reset on success
    // ... existing logic
  };

  eventSource.onerror = () => {
    if (!hasShownErrorRef.current) {
      hasShownErrorRef.current = true;
      toast.error("Connection lost. Refresh to check status.");
    }
  };

  eventSourceRef.current = eventSource;
}, [closeEventSource, handleTerminalState]);
```

**Fix - Use axios.isAxiosError:**

```typescript
// use-query-execution.ts

import axios from "axios";

// In execute catch block:
if (axios.isAxiosError(error) && error.response?.status === 429) {
  toast.error("Too many queries running. Close a tab or wait for a query to complete.");
  setStatus("idle");
  return;
}

// In reconnect catch block:
if (axios.isAxiosError(error) && error.response?.status === 404) {
  clearSessionStorage();
  setStatus("idle");
  setRunId(null);
  return;
}
```

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `apps/api/src/shell-query/shell-query.service.ts` | Remove PII logging, add userId params, update hash length |
| `apps/api/src/shell-query/shell-query.controller.ts` | Add input validation, pass tableMetadata |
| `apps/api/src/shell-query/drizzle-shell-query-run.repository.ts` | Add userId to findRun, markCanceled |
| `apps/api/src/shell-query/shell-query-run.repository.ts` | Update interface |
| `apps/api/src/database/rls-context.service.ts` | Add `runWithUserContext()` method with app.user_id support |
| `packages/backend-shared/src/rls-context.service.ts` | Add `runWithUserContext()` method (worker's copy) |
| `apps/worker/src/shell-query/strategies/run-to-temp.strategy.ts` | Remove PII logging, use provided metadata, update hash length, remove fallback |
| `apps/worker/src/shell-query/query-analyzer.ts` | Fix ENT. handling, reject multi-table SELECT * |
| `apps/worker/src/shell-query/schema-inferrer.ts` | Fix ENT. handling, add SchemaInferenceError, fail fast |
| `apps/worker/src/shell-query/shell-query.types.ts` | Add tableMetadata to ShellQueryJob |
| `apps/web/src/features/editor-workspace/hooks/use-query-execution.ts` | Pass tableMetadata, use isAxiosError, debounce SSE errors |
| `packages/database/drizzle/XXXX_rls_shell_query_runs.sql` | New RLS policy (generated via `drizzle-kit generate --custom`) |
| `packages/shared-types/src/shell-query.ts` | New shared types |

---

## Deployment Order

**CRITICAL:** The RLS migration MUST be deployed AFTER the code changes. If the RLS policy is applied before the code sets `app.user_id`, all queries to `shell_query_runs` will return empty results or fail.

**Recommended order:**
1. Deploy code changes (RlsContextService, repository, service, controller updates)
2. Verify app works correctly without RLS (application-layer userId checks now active)
3. Run RLS migration (`pnpm db:migrate`)
4. Verify RLS is working (check that cross-user access is blocked at DB level)

**Rollback plan:**
- If RLS breaks something, disable the policy:
  ```sql
  ALTER TABLE "shell_query_runs" DISABLE ROW LEVEL SECURITY;
  ```
- Fix the code issue, redeploy, then re-enable RLS

---

## Testing Checklist

- [ ] Verify migration was generated via CLI (`drizzle-kit generate --custom`) and journal is in sync
- [ ] Verify `runWithUserContext()` sets all three: `app.tenant_id`, `app.mid`, `app.user_id`
- [ ] Verify `countActiveRuns()` works correctly under forced RLS
- [ ] Verify PII not logged (check log output for rowset/SQL)
- [ ] Verify user A cannot access user B's run in same tenant (application layer)
- [ ] Verify RLS policy blocks cross-user access at DB level (defense in depth)
- [ ] Verify ENT.TableName SELECT * expansion works
- [ ] Verify multi-table SELECT * returns actionable error
- [ ] Verify parse failure returns actionable error (not silent fallback)
- [ ] Verify frontend metadata is used by worker
- [ ] Verify 8-char hash in DE names
- [ ] Verify SSE errors don't spam toasts
- [ ] Verify axios error handling uses type guard
