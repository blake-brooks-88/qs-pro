import { getDbFromContext, type RlsContextService } from '@qpp/backend-shared';
import type { createDatabaseFromClient } from '@qpp/database';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  notInArray,
  or,
  shellQueryRuns,
  type ShellQueryRunStatus,
  sql,
} from '@qpp/database';

import type {
  CreateShellQueryRunParams,
  ListRunsParams,
  ListRunsResult,
  ShellQueryRun,
  ShellQueryRunRepository,
} from './shell-query-run.repository';

type Database = ReturnType<typeof createDatabaseFromClient>;

export class DrizzleShellQueryRunRepository implements ShellQueryRunRepository {
  constructor(
    private readonly db: Database,
    private readonly rlsContext: RlsContextService,
  ) {}

  /**
   * Get the context-aware database connection.
   * Uses the RLS-context db if available (inside runWithUserContext),
   * otherwise falls back to the default db.
   */
  private getDb(): Database {
    return (getDbFromContext() as Database) ?? this.db;
  }

  async createRun(params: CreateShellQueryRunParams): Promise<void> {
    await this.rlsContext.runWithUserContext(
      params.tenantId,
      params.mid,
      params.userId,
      async () => {
        await this.getDb().insert(shellQueryRuns).values({
          id: params.id,
          tenantId: params.tenantId,
          userId: params.userId,
          mid: params.mid,
          snippetName: params.snippetName,
          targetDeCustomerKey: params.targetDeCustomerKey,
          targetUpdateType: params.targetUpdateType,
          sqlTextHash: params.sqlTextHash,
          sqlTextEncrypted: params.sqlTextEncrypted,
          savedQueryId: params.savedQueryId,
          status: params.status,
        });
      },
    );
  }

  async findRun(
    runId: string,
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<ShellQueryRun | null> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const results = await this.getDb()
          .select()
          .from(shellQueryRuns)
          .where(
            and(
              eq(shellQueryRuns.id, runId),
              eq(shellQueryRuns.tenantId, tenantId),
              eq(shellQueryRuns.mid, mid),
              eq(shellQueryRuns.userId, userId),
            ),
          );

        return results[0] ?? null;
      },
    );
  }

  async markCanceled(
    runId: string,
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<void> {
    await this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        await this.getDb()
          .update(shellQueryRuns)
          .set({ status: 'canceled', completedAt: new Date() })
          .where(
            and(
              eq(shellQueryRuns.id, runId),
              eq(shellQueryRuns.tenantId, tenantId),
              eq(shellQueryRuns.mid, mid),
              eq(shellQueryRuns.userId, userId),
            ),
          );
      },
    );
  }

  async countActiveRuns(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<number> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const result = await this.getDb()
          .select({ count: count() })
          .from(shellQueryRuns)
          .where(
            and(
              eq(shellQueryRuns.tenantId, tenantId),
              eq(shellQueryRuns.mid, mid),
              eq(shellQueryRuns.userId, userId),
              notInArray(shellQueryRuns.status, [
                'ready',
                'failed',
                'canceled',
              ]),
            ),
          );

        return result[0]?.count ?? 0;
      },
    );
  }

  async countMonthlyRuns(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<number> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const now = new Date();
        const startOfMonth = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        );

        const result = await this.getDb()
          .select({ count: count() })
          .from(shellQueryRuns)
          .where(
            and(
              eq(shellQueryRuns.tenantId, tenantId),
              eq(shellQueryRuns.mid, mid),
              eq(shellQueryRuns.userId, userId),
              gte(shellQueryRuns.createdAt, startOfMonth),
              notInArray(shellQueryRuns.status, ['canceled']),
            ),
          );

        return result[0]?.count ?? 0;
      },
    );
  }

  async listRuns(params: ListRunsParams): Promise<ListRunsResult> {
    return this.rlsContext.runWithUserContext(
      params.tenantId,
      params.mid,
      params.userId,
      async () => {
        const conditions = [
          eq(shellQueryRuns.tenantId, params.tenantId),
          eq(shellQueryRuns.mid, params.mid),
          eq(shellQueryRuns.userId, params.userId),
        ];

        if (params.status && params.status.length > 0) {
          conditions.push(
            inArray(
              shellQueryRuns.status,
              params.status as ShellQueryRunStatus[],
            ),
          );
        }

        if (params.dateFrom) {
          conditions.push(gte(shellQueryRuns.createdAt, params.dateFrom));
        }

        if (params.dateTo) {
          conditions.push(lte(shellQueryRuns.createdAt, params.dateTo));
        }

        if (params.queryId) {
          conditions.push(eq(shellQueryRuns.savedQueryId, params.queryId));
        }

        if (params.search) {
          const pattern = `%${params.search}%`;
          const searchCondition = or(
            ilike(shellQueryRuns.snippetName, pattern),
            ilike(shellQueryRuns.targetDeCustomerKey, pattern),
          );
          if (searchCondition) {
            conditions.push(searchCondition);
          }
        }

        const whereClause = and(...conditions);

        const sortColumn = this.getSortColumn(params.sortBy);
        const sortDirection = params.sortDir === 'asc' ? asc : desc;
        const orderByClause = sortDirection(sortColumn);

        const db = this.getDb();

        const [runs, countResult] = await Promise.all([
          db
            .select()
            .from(shellQueryRuns)
            .where(whereClause)
            .orderBy(orderByClause)
            .offset((params.page - 1) * params.pageSize)
            .limit(params.pageSize),
          db.select({ count: count() }).from(shellQueryRuns).where(whereClause),
        ]);

        return {
          runs,
          total: countResult[0]?.count ?? 0,
        };
      },
    );
  }

  private getSortColumn(sortBy: ListRunsParams['sortBy']) {
    switch (sortBy) {
      case 'createdAt':
        return shellQueryRuns.createdAt;
      case 'status':
        return shellQueryRuns.status;
      case 'rowCount':
        return sql`COALESCE(${shellQueryRuns.rowCount}, 0)`;
      case 'durationMs':
        return sql`COALESCE(EXTRACT(EPOCH FROM (${shellQueryRuns.completedAt} - ${shellQueryRuns.startedAt})) * 1000, 0)`;
      default:
        return shellQueryRuns.createdAt;
    }
  }
}
