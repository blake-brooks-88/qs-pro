import {
  createDbStub,
  createMockShellQueryRun,
  createRlsContextStub,
  resetFactories,
} from '@qpp/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DrizzleShellQueryRunRepository } from '../drizzle-shell-query-run.repository';
import type { CreateShellQueryRunParams } from '../shell-query-run.repository';

vi.mock('@qpp/backend-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qpp/backend-shared')>();
  return {
    ...actual,
    getDbFromContext: vi.fn().mockReturnValue(null),
  };
});

describe('DrizzleShellQueryRunRepository', () => {
  let repository: DrizzleShellQueryRunRepository;
  let dbStub: ReturnType<typeof createDbStub>;
  let rlsContextStub: ReturnType<typeof createRlsContextStub>;

  beforeEach(() => {
    resetFactories();

    dbStub = createDbStub();
    rlsContextStub = createRlsContextStub();

    repository = new DrizzleShellQueryRunRepository(
      dbStub as unknown as Parameters<
        (typeof DrizzleShellQueryRunRepository)['prototype']['constructor']
      >[0],
      rlsContextStub as unknown as Parameters<
        (typeof DrizzleShellQueryRunRepository)['prototype']['constructor']
      >[1],
    );
  });

  describe('createRun()', () => {
    it('calls runWithUserContext with correct parameters', async () => {
      // Arrange
      const params: CreateShellQueryRunParams = {
        id: 'run-123',
        tenantId: 'tenant-1',
        userId: 'user-1',
        mid: 'mid-1',
        snippetName: 'Test Query',
        sqlTextHash: 'abc123',
        status: 'queued',
      };

      // Act
      await repository.createRun(params);

      // Assert
      expect(rlsContextStub.runWithUserContext).toHaveBeenCalledWith(
        'tenant-1',
        'mid-1',
        'user-1',
        expect.any(Function),
      );
    });

    it('inserts record with all fields', async () => {
      // Arrange
      const params: CreateShellQueryRunParams = {
        id: 'run-456',
        tenantId: 'tenant-2',
        userId: 'user-2',
        mid: 'mid-2',
        snippetName: 'My Query',
        sqlTextHash: 'def456',
        status: 'queued',
      };

      // Act
      await repository.createRun(params);

      // Assert
      expect(dbStub.insert).toHaveBeenCalled();
    });

    it('handles optional snippetName as undefined', async () => {
      // Arrange
      const params: CreateShellQueryRunParams = {
        id: 'run-789',
        tenantId: 'tenant-3',
        userId: 'user-3',
        mid: 'mid-3',
        sqlTextHash: 'ghi789',
        status: 'queued',
      };

      // Act
      await repository.createRun(params);

      // Assert
      expect(rlsContextStub.runWithUserContext).toHaveBeenCalled();
      expect(dbStub.insert).toHaveBeenCalled();
    });
  });

  describe('findRun()', () => {
    it('calls runWithUserContext with correct parameters', async () => {
      // Arrange
      dbStub.setSelectResult([]);

      // Act
      await repository.findRun('run-123', 'tenant-1', 'mid-1', 'user-1');

      // Assert
      expect(rlsContextStub.runWithUserContext).toHaveBeenCalledWith(
        'tenant-1',
        'mid-1',
        'user-1',
        expect.any(Function),
      );
    });

    it('returns record when found', async () => {
      // Arrange
      const mockRun = createMockShellQueryRun({
        id: 'run-found',
        tenantId: 'tenant-1',
        userId: 'user-1',
        mid: 'mid-1',
      });
      const fullRun = {
        ...mockRun,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
      };
      dbStub.setSelectResult([fullRun]);

      // Act
      const result = await repository.findRun(
        'run-found',
        'tenant-1',
        'mid-1',
        'user-1',
      );

      // Assert
      expect(result).toEqual(fullRun);
    });

    it('returns null when not found', async () => {
      // Arrange
      dbStub.setSelectResult([]);

      // Act
      const result = await repository.findRun(
        'non-existent',
        'tenant-1',
        'mid-1',
        'user-1',
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('markCanceled()', () => {
    it('calls runWithUserContext with correct parameters', async () => {
      // Arrange & Act
      await repository.markCanceled('run-123', 'tenant-1', 'mid-1', 'user-1');

      // Assert
      expect(rlsContextStub.runWithUserContext).toHaveBeenCalledWith(
        'tenant-1',
        'mid-1',
        'user-1',
        expect.any(Function),
      );
    });

    it('updates status to canceled', async () => {
      // Arrange & Act
      await repository.markCanceled('run-123', 'tenant-1', 'mid-1', 'user-1');

      // Assert
      expect(dbStub.update).toHaveBeenCalled();
    });
  });

  describe('countActiveRuns()', () => {
    it('calls runWithUserContext with correct parameters', async () => {
      // Arrange
      dbStub.setSelectResult([{ count: 0 }]);

      // Act
      await repository.countActiveRuns('tenant-1', 'mid-1', 'user-1');

      // Assert
      expect(rlsContextStub.runWithUserContext).toHaveBeenCalledWith(
        'tenant-1',
        'mid-1',
        'user-1',
        expect.any(Function),
      );
    });

    it('returns count of active runs', async () => {
      // Arrange
      dbStub.setSelectResult([{ count: 5 }]);

      // Act
      const result = await repository.countActiveRuns(
        'tenant-1',
        'mid-1',
        'user-1',
      );

      // Assert
      expect(result).toBe(5);
    });
  });
});
