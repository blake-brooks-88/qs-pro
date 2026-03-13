import { AppError, ErrorCode } from '@qpp/backend-shared';
import type { IUserRepository } from '@qpp/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditService } from '../../audit/audit.service';
import { AdminService } from '../admin.service';

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

function createMockAuditService(): { log: ReturnType<typeof vi.fn> } {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

const TENANT_ID = 'tenant-1';
const MID = 'mid-1';

describe('AdminService', () => {
  let service: AdminService;
  let userRepo: ReturnType<typeof createMockUserRepo>;
  let rlsContext: ReturnType<typeof createMockRlsContext>;
  let auditService: ReturnType<typeof createMockAuditService>;

  beforeEach(() => {
    userRepo = createMockUserRepo();
    rlsContext = createMockRlsContext();
    auditService = createMockAuditService();

    service = new AdminService(
      userRepo as unknown as IUserRepository,
      rlsContext as never,
      auditService as unknown as AuditService,
    );
  });

  describe('getUserRole', () => {
    it('returns role for existing user', async () => {
      userRepo.findById.mockResolvedValue({ id: 'u1', role: 'admin' });

      const role = await service.getUserRole('u1');

      expect(role).toBe('admin');
    });

    it('throws RESOURCE_NOT_FOUND for missing user', async () => {
      userRepo.findById.mockResolvedValue(undefined);

      await expect(service.getUserRole('missing')).rejects.toThrow(AppError);
      await expect(service.getUserRole('missing')).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });

  describe('listMembers', () => {
    it('returns mapped member list including joinedAt', async () => {
      const now = new Date();
      userRepo.findByTenantId.mockResolvedValue([
        {
          id: 'u1',
          name: 'Alice',
          email: 'alice@test.com',
          role: 'owner',
          lastActiveAt: now,
          createdAt: now,
          tenantId: TENANT_ID,
          sfUserId: 'sf1',
        },
        {
          id: 'u2',
          name: 'Bob',
          email: 'bob@test.com',
          role: 'member',
          lastActiveAt: null,
          createdAt: now,
          tenantId: TENANT_ID,
          sfUserId: 'sf2',
        },
      ]);

      const result = await service.listMembers(TENANT_ID, MID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'u1',
        name: 'Alice',
        email: 'alice@test.com',
        role: 'owner',
        lastActiveAt: now.toISOString(),
        joinedAt: now.toISOString(),
      });
      expect(result[1]).toMatchObject({
        id: 'u2',
        lastActiveAt: null,
      });
    });
  });

  describe('changeRole', () => {
    const baseParams = {
      actorId: 'actor-1',
      actorRole: 'owner' as const,
      targetUserId: 'target-1',
      newRole: 'admin' as const,
      tenantId: TENANT_ID,
      mid: MID,
    };

    it('successfully changes member to admin', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'target-1',
        role: 'member',
        tenantId: TENANT_ID,
      });

      await service.changeRole(baseParams);

      expect(userRepo.updateRole).toHaveBeenCalledWith('target-1', 'admin');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'role.changed',
          metadata: expect.objectContaining({
            previousRole: 'member',
            newRole: 'admin',
          }),
        }),
      );
    });

    it('successfully changes admin to member', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'target-1',
        role: 'admin',
        tenantId: TENANT_ID,
      });

      await service.changeRole({ ...baseParams, newRole: 'member' });

      expect(userRepo.updateRole).toHaveBeenCalledWith('target-1', 'member');
    });

    it('rejects changing to owner role', async () => {
      await expect(
        service.changeRole({
          ...baseParams,
          newRole: 'owner' as 'admin',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    });

    it("rejects changing owner's role", async () => {
      userRepo.findById.mockResolvedValue({
        id: 'target-1',
        role: 'owner',
        tenantId: TENANT_ID,
      });

      await expect(service.changeRole(baseParams)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('rejects last-admin self-demotion', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'actor-1',
        role: 'admin',
        tenantId: TENANT_ID,
      });
      userRepo.countByTenantIdAndRole.mockResolvedValue(1);

      await expect(
        service.changeRole({
          ...baseParams,
          actorId: 'actor-1',
          actorRole: 'admin',
          targetUserId: 'actor-1',
          newRole: 'member',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    });

    it('rejects changing user from different tenant', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'target-1',
        role: 'member',
        tenantId: 'other-tenant',
      });

      await expect(service.changeRole(baseParams)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('rejects when actor is a member', async () => {
      await expect(
        service.changeRole({
          ...baseParams,
          actorRole: 'member' as 'admin',
          actorId: 'actor-1',
          targetUserId: 'target-1',
          newRole: 'admin',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    });

    it('rejects owner self-demotion', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'actor-1',
        role: 'owner',
        tenantId: TENANT_ID,
      });

      await expect(
        service.changeRole({
          ...baseParams,
          actorId: 'actor-1',
          actorRole: 'owner',
          targetUserId: 'actor-1',
          newRole: 'member',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    });
  });

  describe('transferOwnership', () => {
    const baseParams = {
      currentOwnerId: 'owner-1',
      newOwnerId: 'user-2',
      tenantId: TENANT_ID,
      mid: MID,
    };

    it('successfully transfers ownership', async () => {
      userRepo.findById
        .mockResolvedValueOnce({
          id: 'owner-1',
          role: 'owner',
          tenantId: TENANT_ID,
        })
        .mockResolvedValueOnce({
          id: 'user-2',
          role: 'admin',
          tenantId: TENANT_ID,
        });

      await service.transferOwnership(baseParams);

      expect(userRepo.updateRole).toHaveBeenCalledWith('owner-1', 'admin');
      expect(userRepo.updateRole).toHaveBeenCalledWith('user-2', 'owner');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'role.ownership_transferred',
          metadata: expect.objectContaining({
            previousOwnerId: 'owner-1',
            newOwnerId: 'user-2',
          }),
        }),
      );
    });

    it('rejects if current user is not owner', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'owner-1',
        role: 'admin',
        tenantId: TENANT_ID,
      });

      await expect(service.transferOwnership(baseParams)).rejects.toMatchObject(
        { code: ErrorCode.VALIDATION_ERROR },
      );
    });

    it('rejects if target user not found', async () => {
      userRepo.findById
        .mockResolvedValueOnce({
          id: 'owner-1',
          role: 'owner',
          tenantId: TENANT_ID,
        })
        .mockResolvedValueOnce(undefined);

      await expect(service.transferOwnership(baseParams)).rejects.toMatchObject(
        { code: ErrorCode.RESOURCE_NOT_FOUND },
      );
    });

    it('rejects cross-tenant target user', async () => {
      userRepo.findById
        .mockResolvedValueOnce({
          id: 'owner-1',
          role: 'owner',
          tenantId: TENANT_ID,
        })
        .mockResolvedValueOnce({
          id: 'user-2',
          role: 'admin',
          tenantId: 'other-tenant',
        });

      await expect(service.transferOwnership(baseParams)).rejects.toMatchObject(
        { code: ErrorCode.VALIDATION_ERROR },
      );
    });
  });
});
