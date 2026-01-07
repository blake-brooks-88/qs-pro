import { getDbFromContext } from './db-context';

/**
 * Creates a proxy that redirects all database calls to the request-scoped context
 * if available, otherwise falls back to the default database instance.
 */
export function createDbProxy<T extends object>(defaultDb: T): T {
  return new Proxy(defaultDb, {
    get(target: T, property: string | symbol) {
      const dbFromContext = getDbFromContext();
      const activeDb = (dbFromContext || target) as T;
      const value = Reflect.get(activeDb, property, activeDb);

      if (typeof value === 'function') {
        return value.bind(activeDb);
      }
      return value;
    },
  });
}
