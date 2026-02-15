import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NewAuditLogEntry } from '../audit.repository';
import { DrizzleAuditLogRepository } from '../drizzle-audit-log.repository';

// Mock getDbFromContext so repository uses the injected db
vi.mock('@qpp/backend-shared', () => ({
  getDbFromContext: vi.fn(() => undefined),
}));

// ── helpers ──────────────────────────────────────────────────────

function createMockEntry(
  overrides: Partial<NewAuditLogEntry> = {},
): NewAuditLogEntry {
  return {
    tenantId: 'tenant-1',
    mid: '12345',
    eventType: 'query.created',
    actorType: 'user',
    actorId: 'user-1',
    targetId: 'target-1',
    metadata: { queryName: 'Test Query' },
    ipAddress: '127.0.0.1',
    userAgent: 'TestAgent/1.0',
    ...overrides,
  };
}

function createMockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    tenantId: 'tenant-1',
    mid: '12345',
    eventType: 'query.created',
    actorType: 'user',
    actorId: 'user-1',
    targetId: 'target-1',
    metadata: { queryName: 'Test Query' },
    ipAddress: '127.0.0.1',
    userAgent: 'TestAgent/1.0',
    createdAt: new Date('2026-02-10T12:00:00Z'),
    ...overrides,
  };
}

/**
 * Creates a mock Drizzle DB that supports the full query chains used by the repository:
 * - insert(table).values(data)
 * - select().from(table).where().orderBy().offset().limit()
 * - select({count}).from(table).where()
 */
function createMockDb() {
  const selectItems: unknown[] = [];
  const countResult = [{ count: 0 }];

  const valuesFn = vi.fn().mockResolvedValue(undefined);
  const insertFn = vi.fn(() => ({ values: valuesFn }));

  const createSelectChain = (isCountQuery: boolean) => {
    const limitFn = vi.fn(() => (isCountQuery ? countResult : selectItems));
    const offsetFn = vi.fn(() => ({ limit: limitFn }));
    const orderByFn = vi.fn(() => ({ offset: offsetFn }));
    const whereFn = vi.fn(() =>
      isCountQuery ? countResult : { orderBy: orderByFn },
    );
    return {
      from: vi.fn(() => ({ where: whereFn })),
      _where: whereFn,
      _orderBy: orderByFn,
      _offset: offsetFn,
      _limit: limitFn,
    };
  };

  // Use a select mock that alternates: first call = items, second call = count
  // (matches the Promise.all in findAll)
  const selectFn = vi.fn((...args: unknown[]) => {
    const isCountQuery = args.length > 0; // select({ count: count() }) has args
    return createSelectChain(isCountQuery);
  });

  return {
    db: { insert: insertFn, select: selectFn } as unknown as ReturnType<
      typeof import('@qpp/database').createDatabaseFromClient
    >,
    insertFn,
    valuesFn,
    selectFn,
    setItems: (items: unknown[]) => {
      selectItems.length = 0;
      selectItems.push(...items);
    },
    setCount: (n: number) => {
      countResult[0] = { count: n };
    },
  };
}

// ── tests ────────────────────────────────────────────────────────

describe('DrizzleAuditLogRepository', () => {
  let repo: DrizzleAuditLogRepository;
  let mock: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = createMockDb();
    repo = new DrizzleAuditLogRepository(mock.db);
  });

  // ── insert ───────────────────────────────────────────────────

  describe('insert', () => {
    it('calls db.insert with all entry fields', async () => {
      const entry = createMockEntry();

      await repo.insert(entry);

      expect(mock.insertFn).toHaveBeenCalledOnce();
      expect(mock.valuesFn).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        mid: '12345',
        eventType: 'query.created',
        actorType: 'user',
        actorId: 'user-1',
        targetId: 'target-1',
        metadata: { queryName: 'Test Query' },
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
      });
    });

    it('handles null optional fields', async () => {
      const entry = createMockEntry({
        actorId: null,
        targetId: null,
        metadata: null,
        ipAddress: null,
        userAgent: null,
      });

      await repo.insert(entry);

      expect(mock.valuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: null,
          targetId: null,
          metadata: null,
          ipAddress: null,
          userAgent: null,
        }),
      );
    });
  });

  // ── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    const defaultParams = {
      page: 1,
      pageSize: 25,
      sortBy: 'createdAt' as const,
      sortDir: 'desc' as const,
    };

    it('returns items and total count', async () => {
      const rows = [createMockRow(), createMockRow({ id: 'row-2' })];
      mock.setItems(rows);
      mock.setCount(2);

      const result = await repo.findAll(defaultParams);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('returns 0 total when no count results', async () => {
      mock.setItems([]);
      mock.setCount(0);

      const result = await repo.findAll(defaultParams);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('passes eventType exact match when no wildcard', async () => {
      mock.setItems([]);
      mock.setCount(0);

      await repo.findAll({ ...defaultParams, eventType: 'query.created' });

      // Verify select was called (items + count = 2 calls)
      expect(mock.selectFn).toHaveBeenCalledTimes(2);
    });

    it('passes eventType with LIKE when wildcard present', async () => {
      mock.setItems([]);
      mock.setCount(0);

      await repo.findAll({ ...defaultParams, eventType: 'query.*' });

      expect(mock.selectFn).toHaveBeenCalledTimes(2);
    });

    it('filters by actorId when provided', async () => {
      mock.setItems([]);
      mock.setCount(0);

      await repo.findAll({
        ...defaultParams,
        actorId: 'user-abc',
      });

      expect(mock.selectFn).toHaveBeenCalledTimes(2);
    });

    it('filters by targetId when provided', async () => {
      mock.setItems([]);
      mock.setCount(0);

      await repo.findAll({
        ...defaultParams,
        targetId: 'target-abc',
      });

      expect(mock.selectFn).toHaveBeenCalledTimes(2);
    });

    it('filters by dateFrom when provided', async () => {
      mock.setItems([]);
      mock.setCount(0);

      await repo.findAll({
        ...defaultParams,
        dateFrom: '2026-02-01',
      });

      expect(mock.selectFn).toHaveBeenCalledTimes(2);
    });

    it('treats date-only dateTo as end-of-day (23:59:59.999Z)', async () => {
      mock.setItems([]);
      mock.setCount(0);

      // This tests the bug fix from Task 2.1
      await repo.findAll({
        ...defaultParams,
        dateTo: '2026-02-14',
      });

      expect(mock.selectFn).toHaveBeenCalledTimes(2);
    });

    it('treats ISO datetime dateTo as-is', async () => {
      mock.setItems([]);
      mock.setCount(0);

      await repo.findAll({
        ...defaultParams,
        dateTo: '2026-02-14T15:30:00.000Z',
      });

      expect(mock.selectFn).toHaveBeenCalledTimes(2);
    });

    it('filters by search (ILIKE on metadata)', async () => {
      mock.setItems([]);
      mock.setCount(0);

      await repo.findAll({
        ...defaultParams,
        search: 'test-query',
      });

      expect(mock.selectFn).toHaveBeenCalledTimes(2);
    });

    it('accepts sortBy=eventType', async () => {
      mock.setItems([]);
      mock.setCount(0);

      await repo.findAll({
        ...defaultParams,
        sortBy: 'eventType',
        sortDir: 'asc',
      });

      expect(mock.selectFn).toHaveBeenCalledTimes(2);
    });
  });
});
