import { getDbFromContext } from '@qpp/backend-shared';
import {
  createDatabaseFromClient,
  desc,
  eq,
  queryPublishEvents,
} from '@qpp/database';

import type {
  CreateQueryPublishEventParams,
  QueryPublishEvent,
  QueryPublishEventsRepository,
} from './query-publish-events.repository';

type Database = ReturnType<typeof createDatabaseFromClient>;

export class DrizzleQueryPublishEventsRepository implements QueryPublishEventsRepository {
  constructor(private readonly db: Database) {}

  private getDb(): Database {
    return (getDbFromContext() as Database) ?? this.db;
  }

  async create(
    params: CreateQueryPublishEventParams,
  ): Promise<QueryPublishEvent> {
    const results = await this.getDb()
      .insert(queryPublishEvents)
      .values({
        savedQueryId: params.savedQueryId,
        versionId: params.versionId,
        tenantId: params.tenantId,
        mid: params.mid,
        userId: params.userId,
        linkedQaCustomerKey: params.linkedQaCustomerKey,
        publishedSqlHash: params.publishedSqlHash,
      })
      .returning();
    const event = results[0];
    if (!event) {
      throw new Error('Failed to create query publish event');
    }
    return event;
  }

  async findLatestBySavedQueryId(
    savedQueryId: string,
  ): Promise<QueryPublishEvent | null> {
    const results = await this.getDb()
      .select()
      .from(queryPublishEvents)
      .where(eq(queryPublishEvents.savedQueryId, savedQueryId))
      .orderBy(desc(queryPublishEvents.createdAt))
      .limit(1);
    return results[0] ?? null;
  }

  async findBySavedQueryId(savedQueryId: string): Promise<QueryPublishEvent[]> {
    return this.getDb()
      .select()
      .from(queryPublishEvents)
      .where(eq(queryPublishEvents.savedQueryId, savedQueryId))
      .orderBy(desc(queryPublishEvents.createdAt));
  }
}
