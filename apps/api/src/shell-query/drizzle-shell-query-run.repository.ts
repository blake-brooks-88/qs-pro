import { getDbFromContext, type RlsContextService } from '@qpp/backend-shared';
import type { createDatabaseFromClient } from '@qpp/database';
import { and, count, eq, notInArray, shellQueryRuns } from '@qpp/database';

import type {
  CreateShellQueryRunParams,
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
}
