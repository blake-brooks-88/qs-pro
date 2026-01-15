import { and, count, eq, notInArray, shellQueryRuns } from '@qs-pro/database';
import type { createDatabaseFromClient } from '@qs-pro/database';
import type { RlsContextService } from '../database/rls-context.service';
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

  async createRun(params: CreateShellQueryRunParams): Promise<void> {
    await this.rlsContext.runWithTenantContext(
      params.tenantId,
      params.mid,
      async () => {
        await this.db.insert(shellQueryRuns).values({
          id: params.id,
          tenantId: params.tenantId,
          userId: params.userId,
          mid: params.mid,
          snippetName: params.snippetName,
          sqlTextHash: params.sqlTextHash,
          status: params.status,
        });
      },
    );
  }

  async findRun(
    runId: string,
    tenantId: string,
  ): Promise<ShellQueryRun | null> {
    const results = await this.db
      .select()
      .from(shellQueryRuns)
      .where(
        and(
          eq(shellQueryRuns.id, runId),
          eq(shellQueryRuns.tenantId, tenantId),
        ),
      );

    return results[0] ?? null;
  }

  async markCanceled(
    runId: string,
    tenantId: string,
    mid: string,
  ): Promise<void> {
    await this.rlsContext.runWithTenantContext(tenantId, mid, async () => {
      await this.db
        .update(shellQueryRuns)
        .set({ status: 'canceled', completedAt: new Date() })
        .where(eq(shellQueryRuns.id, runId));
    });
  }

  async countActiveRuns(userId: string): Promise<number> {
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
  }
}
