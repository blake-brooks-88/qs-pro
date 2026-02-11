import { resetFactories } from '@qpp/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DrizzleQueryPublishEventsRepository } from '../drizzle-query-publish-events.repository';
import type { CreateQueryPublishEventParams } from '../query-publish-events.repository';

vi.mock('@qpp/backend-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qpp/backend-shared')>();
  return {
    ...actual,
    getDbFromContext: vi.fn().mockReturnValue(null),
  };
});

vi.mock('@qpp/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qpp/database')>();
  return {
    ...actual,
    eq: vi.fn((...args: unknown[]) => args),
    desc: vi.fn((col: unknown) => col),
  };
});

describe('DrizzleQueryPublishEventsRepository', () => {
  let repository: DrizzleQueryPublishEventsRepository;
  let resolveData: unknown[];

  const mockEvent = {
    id: 'pe-1',
    savedQueryId: 'sq-1',
    versionId: 'v-1',
    tenantId: 'tenant-1',
    mid: 'mid-1',
    userId: 'user-1',
    linkedQaCustomerKey: 'qa-key-1',
    publishedSqlHash: 'hash-abc',
    createdAt: new Date('2026-02-10T12:00:00Z'),
  };

  const createChainProxy = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolveData);
          }
          return vi.fn().mockReturnValue(createChainProxy());
        },
      },
    );

  beforeEach(() => {
    resetFactories();
    resolveData = [];

    const mockDb = new Proxy(
      {},
      {
        get(_target, prop) {
          if (typeof prop === 'string') {
            return vi.fn().mockReturnValue(createChainProxy());
          }
          return undefined;
        },
      },
    );

    type RepoCtorArgs = ConstructorParameters<
      typeof DrizzleQueryPublishEventsRepository
    >;
    repository = new DrizzleQueryPublishEventsRepository(
      mockDb as unknown as RepoCtorArgs[0],
    );
  });

  describe('create()', () => {
    it('returns the inserted publish event', async () => {
      // Arrange
      resolveData = [mockEvent];
      const params: CreateQueryPublishEventParams = {
        savedQueryId: 'sq-1',
        versionId: 'v-1',
        tenantId: 'tenant-1',
        mid: 'mid-1',
        userId: 'user-1',
        linkedQaCustomerKey: 'qa-key-1',
        publishedSqlHash: 'hash-abc',
      };

      // Act
      const result = await repository.create(params);

      // Assert
      expect(result).toEqual(mockEvent);
    });

    it('returns the first element from the returning() result', async () => {
      // Arrange
      const secondEvent = { ...mockEvent, id: 'pe-2' };
      resolveData = [mockEvent, secondEvent];

      const params: CreateQueryPublishEventParams = {
        savedQueryId: 'sq-1',
        versionId: 'v-1',
        tenantId: 'tenant-1',
        mid: 'mid-1',
        userId: 'user-1',
        linkedQaCustomerKey: 'qa-key-1',
        publishedSqlHash: 'hash-abc',
      };

      // Act
      const result = await repository.create(params);

      // Assert
      expect(result.id).toBe('pe-1');
    });

    it('throws when the insert returns an empty result', async () => {
      // Arrange
      resolveData = [];
      const params: CreateQueryPublishEventParams = {
        savedQueryId: 'sq-1',
        versionId: 'v-1',
        tenantId: 'tenant-1',
        mid: 'mid-1',
        userId: 'user-1',
        linkedQaCustomerKey: 'qa-key-1',
        publishedSqlHash: 'hash-abc',
      };

      // Act & Assert
      await expect(repository.create(params)).rejects.toThrow(
        'Failed to create query publish event',
      );
    });
  });

  describe('findLatestBySavedQueryId()', () => {
    it('returns the most recent event when events exist', async () => {
      // Arrange
      resolveData = [mockEvent];

      // Act
      const result = await repository.findLatestBySavedQueryId('sq-1');

      // Assert
      expect(result).toEqual(mockEvent);
    });

    it('returns null when no events exist', async () => {
      // Arrange
      resolveData = [];

      // Act
      const result = await repository.findLatestBySavedQueryId('sq-1');

      // Assert
      expect(result).toBeNull();
    });

    it('returns the first element from the query result', async () => {
      // Arrange
      const olderEvent = {
        ...mockEvent,
        id: 'pe-old',
        createdAt: new Date('2026-02-09T12:00:00Z'),
      };
      resolveData = [mockEvent, olderEvent];

      // Act
      const result = await repository.findLatestBySavedQueryId('sq-1');

      // Assert
      expect(result).toEqual(mockEvent);
    });
  });
});
