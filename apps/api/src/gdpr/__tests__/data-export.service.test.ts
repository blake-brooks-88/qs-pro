import { AppError } from '@qpp/backend-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataExportService } from '../data-export.service';

function createMockDb() {
  let selectCallIndex = 0;
  const selectResults: unknown[][] = [];

  const mockSelect = vi.fn(() => {
    const idx = selectCallIndex++;
    const result = selectResults[idx] ?? [];

    const chainObj: Record<string, unknown> = {};
    const chainFn = vi.fn(() => chainObj);
    chainObj.from = chainFn;
    chainObj.where = vi.fn(() => chainObj);
    chainObj.limit = vi.fn(() => Promise.resolve(result));
    // Make chainObj itself thenable so `await db.select().from().where()` works
    chainObj.then = (
      resolve: (v: unknown) => void,
      reject: (e: unknown) => void,
    ) => Promise.resolve(result).then(resolve, reject);

    return chainObj;
  });

  return {
    select: mockSelect,
    _setResults: (...results: unknown[][]) => {
      selectResults.length = 0;
      selectResults.push(...results);
      selectCallIndex = 0;
    },
  };
}

function createMockEncryptionService() {
  return {
    encrypt: vi.fn((v: string) => `enc_${v}`),
    decrypt: vi.fn((v: string) => v.replace('enc_', '')),
  };
}

function createMockRlsContext() {
  return {
    runWithTenantContext: vi.fn(
      (_tenantId: string, _mid: string, fn: () => unknown) => fn(),
    ),
  };
}

const TENANT_ID = 'tenant-123';
const MID = 'mid-100';
const USER_ID = 'user-abc';
const NOW = new Date('2026-01-15T12:00:00Z');

describe('DataExportService', () => {
  let service: DataExportService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockEncryption: ReturnType<typeof createMockEncryptionService>;
  let mockRls: ReturnType<typeof createMockRlsContext>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockEncryption = createMockEncryptionService();
    mockRls = createMockRlsContext();

    service = new DataExportService(
      mockDb as any,
      mockEncryption as any,
      mockRls as any,
    );
  });

  describe('exportUserData', () => {
    function setupUserFound() {
      mockDb._setResults(
        // 1. User query (uses .limit)
        [
          {
            id: USER_ID,
            email: 'user@example.com',
            name: 'Test User',
            sfUserId: 'sf-user-1',
            role: 'member',
            tenantId: TENANT_ID,
            lastActiveAt: null,
            createdAt: NOW,
          },
        ],
        // 2. Folders query
        [
          {
            id: 'folder-1',
            name: 'My Folder',
            visibility: 'personal',
            parentId: null,
            createdAt: NOW,
          },
        ],
        // 3. Saved queries
        [
          {
            id: 'sq-1',
            name: 'My Query',
            sqlTextEncrypted: 'enc_SELECT 1',
            folderId: 'folder-1',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        // 4. Snippets
        [
          {
            id: 'snip-1',
            title: 'My Snippet',
            code: 'SELECT * FROM table',
            isShared: false,
            createdAt: NOW,
          },
        ],
        // 5. Shell query runs
        [
          {
            id: 'run-1',
            sqlTextEncrypted: 'enc_SELECT 2',
            status: 'ready',
            rowCount: 42,
            createdAt: NOW,
            completedAt: NOW,
          },
        ],
      );
    }

    it('should include user profile data in export', async () => {
      setupUserFound();

      const result = await service.exportUserData(TENANT_ID, MID, USER_ID);

      expect(result.user).toEqual({
        id: USER_ID,
        email: 'user@example.com',
        name: 'Test User',
        sfUserId: 'sf-user-1',
        role: 'member',
        createdAt: NOW.toISOString(),
      });
    });

    it('should include saved queries with decrypted SQL (R14)', async () => {
      setupUserFound();

      const result = await service.exportUserData(TENANT_ID, MID, USER_ID);

      expect(result.savedQueries).toHaveLength(1);
      expect(result.savedQueries[0]).toMatchObject({
        id: 'sq-1',
        name: 'My Query',
        sql: 'SELECT 1',
        folderId: 'folder-1',
      });
    });

    it('should include folders in export', async () => {
      setupUserFound();

      const result = await service.exportUserData(TENANT_ID, MID, USER_ID);

      expect(result.folders).toHaveLength(1);
      expect(result.folders[0]).toMatchObject({
        id: 'folder-1',
        name: 'My Folder',
        visibility: 'personal',
        parentId: null,
      });
    });

    it('should include snippets in export', async () => {
      setupUserFound();

      const result = await service.exportUserData(TENANT_ID, MID, USER_ID);

      expect(result.snippets).toHaveLength(1);
      expect(result.snippets[0]).toMatchObject({
        id: 'snip-1',
        title: 'My Snippet',
        code: 'SELECT * FROM table',
        isShared: false,
      });
    });

    it('should include execution history with decrypted SQL (R14)', async () => {
      setupUserFound();

      const result = await service.exportUserData(TENANT_ID, MID, USER_ID);

      expect(result.queryExecutionHistory).toHaveLength(1);
      expect(result.queryExecutionHistory[0]).toMatchObject({
        id: 'run-1',
        sql: 'SELECT 2',
        status: 'ready',
        rowCount: 42,
      });
    });

    it('should call EncryptionService.decrypt for each encrypted field', async () => {
      setupUserFound();

      await service.exportUserData(TENANT_ID, MID, USER_ID);

      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_SELECT 1');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_SELECT 2');
      expect(mockEncryption.decrypt).toHaveBeenCalledTimes(2);
    });

    it('should throw RESOURCE_NOT_FOUND when user does not exist', async () => {
      mockDb._setResults([]);

      await expect(
        service.exportUserData(TENANT_ID, MID, 'nonexistent-user'),
      ).rejects.toThrow(AppError);
    });

    it('should include exportedAt timestamp', async () => {
      setupUserFound();

      const result = await service.exportUserData(TENANT_ID, MID, USER_ID);

      expect(result.exportedAt).toBeDefined();
      expect(() => new Date(result.exportedAt)).not.toThrow();
    });
  });
});
