import { Inject, Injectable } from '@nestjs/common';
import { RlsContextService } from '@qpp/backend-shared';
import type { UsageResponse } from '@qpp/shared-types';

import { FeaturesService } from '../features/features.service';
import type { SavedQueriesRepository } from '../saved-queries/saved-queries.repository';
import type { ShellQueryRunRepository } from '../shell-query/shell-query-run.repository';

export const FREE_TIER_RUN_LIMIT = 50;
export const FREE_TIER_SAVED_QUERY_LIMIT = 5;

@Injectable()
export class UsageService {
  constructor(
    @Inject('SHELL_QUERY_RUN_REPOSITORY')
    private readonly runRepo: ShellQueryRunRepository,
    @Inject('SAVED_QUERIES_REPOSITORY')
    private readonly savedQueriesRepo: SavedQueriesRepository,
    private readonly featuresService: FeaturesService,
    private readonly rlsContext: RlsContextService,
  ) {}

  async getUsage(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<UsageResponse> {
    const { tier } = await this.featuresService.getTenantFeatures(tenantId);

    const [runCount, savedQueryCount] = await Promise.all([
      this.runRepo.countMonthlyRuns(tenantId, mid, userId),
      this.rlsContext.runWithUserContext(tenantId, mid, userId, () =>
        this.savedQueriesRepo.countByUser(userId),
      ),
    ]);

    const isFreeTier = tier === 'free';

    const now = new Date();
    const resetDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    return {
      queryRuns: {
        current: runCount,
        limit: isFreeTier ? FREE_TIER_RUN_LIMIT : null,
        resetDate: resetDate.toISOString(),
      },
      savedQueries: {
        current: savedQueryCount,
        limit: isFreeTier ? FREE_TIER_SAVED_QUERY_LIMIT : null,
      },
    };
  }

  async getMonthlyRunCount(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<number> {
    return this.runRepo.countMonthlyRuns(tenantId, mid, userId);
  }
}
