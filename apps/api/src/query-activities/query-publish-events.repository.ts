import type { queryPublishEvents } from '@qpp/database';

export type QueryPublishEvent = typeof queryPublishEvents.$inferSelect;

export interface CreateQueryPublishEventParams {
  savedQueryId: string;
  versionId: string;
  tenantId: string;
  mid: string;
  userId: string;
  linkedQaCustomerKey: string;
  publishedSqlHash: string;
}

export interface QueryPublishEventsRepository {
  create(params: CreateQueryPublishEventParams): Promise<QueryPublishEvent>;
  findLatestBySavedQueryId(
    savedQueryId: string,
  ): Promise<QueryPublishEvent | null>;
  findBySavedQueryId(savedQueryId: string): Promise<QueryPublishEvent[]>;
}
