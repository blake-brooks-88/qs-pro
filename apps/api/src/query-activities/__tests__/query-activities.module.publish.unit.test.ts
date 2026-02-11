import { describe, expect, it } from 'vitest';

import { QueryActivitiesModule } from '../query-activities.module';

describe('QueryActivitiesModule', () => {
  it('is defined', () => {
    expect(QueryActivitiesModule).toBeDefined();
  });

  // QUERY_PUBLISH_EVENT_REPOSITORY wiring is verified by integration tests
  // (Plan 04) which bootstrap the real NestJS app with full DI container.
  // The module registers it as a factory provider using 'DATABASE' injection.
});
