import { AppError } from '@qpp/backend-shared';
import type { IUserRepository, User } from '@qpp/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserDeletionService } from '../user-deletion.service';

function createMockDb() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'folder-id' }]),
    }),
    returning: vi.fn().mockResolvedValue([]),
  };

  return {
    select: vi.fn().mockReturnValue(chain),
    update: vi.fn().mockReturnValue(chain),
    insert: vi.fn().mockReturnValue(chain),
    delete: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

function createMockUserRepo(): {
  [K in keyof IUserRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    findById: vi.fn(),
    findBySfUserId: vi.fn(),
    upsert: vi.fn(),
    updateRole: vi.fn(),
    findByTenantId: vi.fn(),
    updateLastActiveAt: vi.fn(),
    countByTenantIdAndRole: vi.fn(),
  };
}

function createMockRlsContext() {
  return {
    runWithTenantContext: vi.fn(
      (_tenantId: string, _mid: string, fn: () => unknown) => fn(),
    ),
    runWithIsolatedTenantContext: vi.fn(
      (_tenantId: string, _mid: string, fn: () => unknown) => fn(),
    ),
  };
}

function createMockAuditAnonymization() {
  return {
    anonymizeForUser: vi.fn().mockResolvedValue(5),
  };
}

const TENANT_ID = 'tenant-123';
const MID = 'mid-100';
const TARGET_USER_ID = 'user-target';
const ACTOR_ID = 'user-actor';
const OWNER_ID = 'user-owner';

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: TARGET_USER_ID,
    sfUserId: 'sf-user-1',
    tenantId: TENANT_ID,
    email: 'target@example.com',
    name: 'Target User',
    role: 'member',
    lastActiveAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('UserDeletionService', () => {
  let service: UserDeletionService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockUserRepo: ReturnType<typeof createMockUserRepo>;
  let mockRls: ReturnType<typeof createMockRlsContext>;
  let mockAuditAnon: ReturnType<typeof createMockAuditAnonymization>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockUserRepo = createMockUserRepo();
    mockRls = createMockRlsContext();
    mockAuditAnon = createMockAuditAnonymization();

    service = new UserDeletionService(
      mockDb as any,
      mockUserRepo as unknown as IUserRepository,
      mockRls as any,
      mockAuditAnon as any,
    );
  });

  describe('deleteUser', () => {
    function setupDefaultMocks() {
      const targetUser = createUser();
      mockUserRepo.findById.mockResolvedValueOnce(targetUser);

      // Owner lookup
      mockDb._chain.where.mockReturnValueOnce([
        { id: OWNER_ID, role: 'owner', tenantId: TENANT_ID },
      ]);

      // Archive root folder lookup (not found)
      mockDb._chain.where.mockReturnValueOnce([]);

      // Archive root creation
      const returningMock = vi.fn().mockResolvedValue([{ id: 'archive-root' }]);
      mockDb._chain.values.mockReturnValueOnce({ returning: returningMock });

      // Archive subfolder creation
      const subReturningMock = vi
        .fn()
        .mockResolvedValue([{ id: 'archive-sub' }]);
      mockDb._chain.values.mockReturnValueOnce({ returning: subReturningMock });

      // Personal folders query
      mockDb._chain.where.mockReturnValueOnce([]);

      return targetUser;
    }

    it('should throw when owner tries to be deleted', async () => {
      mockUserRepo.findById.mockResolvedValueOnce(
        createUser({ id: TARGET_USER_ID, role: 'owner' }),
      );

      await expect(
        service.deleteUser({
          tenantId: TENANT_ID,
          mid: MID,
          targetUserId: TARGET_USER_ID,
          actorId: ACTOR_ID,
        }),
      ).rejects.toThrow(AppError);
    });

    it('should throw when trying to delete yourself', async () => {
      mockUserRepo.findById.mockResolvedValueOnce(createUser({ id: ACTOR_ID }));

      await expect(
        service.deleteUser({
          tenantId: TENANT_ID,
          mid: MID,
          targetUserId: ACTOR_ID,
          actorId: ACTOR_ID,
        }),
      ).rejects.toThrow(AppError);
    });

    it('should throw RESOURCE_NOT_FOUND when user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValueOnce(undefined);

      await expect(
        service.deleteUser({
          tenantId: TENANT_ID,
          mid: MID,
          targetUserId: TARGET_USER_ID,
          actorId: ACTOR_ID,
        }),
      ).rejects.toThrow(AppError);
    });

    it('should call audit anonymization for the target user', async () => {
      setupDefaultMocks();

      await service.deleteUser({
        tenantId: TENANT_ID,
        mid: MID,
        targetUserId: TARGET_USER_ID,
        actorId: ACTOR_ID,
      });

      expect(mockAuditAnon.anonymizeForUser).toHaveBeenCalledWith(
        TARGET_USER_ID,
        TENANT_ID,
      );
    });

    it('should delete user credentials', async () => {
      setupDefaultMocks();

      await service.deleteUser({
        tenantId: TENANT_ID,
        mid: MID,
        targetUserId: TARGET_USER_ID,
        actorId: ACTOR_ID,
      });

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should delete user row from database', async () => {
      setupDefaultMocks();

      await service.deleteUser({
        tenantId: TENANT_ID,
        mid: MID,
        targetUserId: TARGET_USER_ID,
        actorId: ACTOR_ID,
      });

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should create deletion ledger entry with entity_identifier null (R2)', async () => {
      setupDefaultMocks();

      await service.deleteUser({
        tenantId: TENANT_ID,
        mid: MID,
        targetUserId: TARGET_USER_ID,
        actorId: ACTOR_ID,
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb._chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'user',
          entityIdentifier: null,
          deletedBy: `admin:${ACTOR_ID}`,
        }),
      );
    });
  });
});
