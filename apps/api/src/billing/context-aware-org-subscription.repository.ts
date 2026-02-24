import { getDbFromContext } from '@qpp/backend-shared';
import {
  createDatabaseFromClient,
  DrizzleOrgSubscriptionRepository,
} from '@qpp/database';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

type Database = ReturnType<typeof createDatabaseFromClient>;

export function createContextAwareOrgSubscriptionRepository(
  db: PostgresJsDatabase,
): DrizzleOrgSubscriptionRepository {
  return new Proxy(new DrizzleOrgSubscriptionRepository(db), {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      return (...args: unknown[]) => {
        const contextDb = getDbFromContext() as Database | undefined;
        if (contextDb) {
          const contextRepo = new DrizzleOrgSubscriptionRepository(contextDb);
          return (contextRepo as any)[prop](...args);
        }
        return value.apply(target, args);
      };
    },
  });
}
