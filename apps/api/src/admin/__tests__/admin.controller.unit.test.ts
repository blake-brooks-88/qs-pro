import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminController } from '../admin.controller';
import type { AdminService, MemberListItem } from '../admin.service';

function createMockAdminService(): {
  [K in keyof AdminService]: ReturnType<typeof vi.fn>;
} {
  return {
    getUserRole: vi.fn(),
    listMembers: vi.fn(),
    changeRole: vi.fn(),
    transferOwnership: vi.fn(),
    softDeleteTenant: vi.fn(),
    deleteUser: vi.fn(),
  };
}

const mockSession = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  mid: 'mid-1',
};

const mockReq = {
  ip: '127.0.0.1',
  headers: { 'user-agent': 'test-agent' },
} as never;

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: ReturnType<typeof createMockAdminService>;

  beforeEach(() => {
    adminService = createMockAdminService();
    controller = new AdminController(adminService as unknown as AdminService);
  });

  describe('GET /admin/members', () => {
    it('returns member list', async () => {
      const members: MemberListItem[] = [
        {
          id: 'u1',
          name: 'Alice',
          email: 'alice@test.com',
          role: 'owner',
          lastActiveAt: null,
          joinedAt: '2024-01-01T00:00:00.000Z',
        },
      ];
      adminService.listMembers.mockResolvedValue(members);

      const result = await controller.listMembers(mockSession);

      expect(result).toEqual({ members });
      expect(adminService.listMembers).toHaveBeenCalledWith(
        'tenant-1',
        'mid-1',
      );
    });
  });

  describe('PATCH /admin/members/:id/role', () => {
    it('changes role and returns ok', async () => {
      adminService.getUserRole.mockResolvedValue('owner');
      adminService.changeRole.mockResolvedValue(undefined);

      const result = await controller.changeRole(
        mockSession,
        '550e8400-e29b-41d4-a716-446655440000',
        { role: 'admin' },
        mockReq,
      );

      expect(result).toEqual({ ok: true });
      expect(adminService.changeRole).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user-1',
          actorRole: 'owner',
          targetUserId: '550e8400-e29b-41d4-a716-446655440000',
          newRole: 'admin',
        }),
      );
    });
  });

  describe('POST /admin/transfer-ownership', () => {
    it('transfers ownership and returns ok', async () => {
      adminService.transferOwnership.mockResolvedValue(undefined);

      const result = await controller.transferOwnership(
        mockSession,
        { newOwnerId: 'new-owner-id' },
        mockReq,
      );

      expect(result).toEqual({ ok: true });
      expect(adminService.transferOwnership).toHaveBeenCalledWith(
        expect.objectContaining({
          currentOwnerId: 'user-1',
          newOwnerId: 'new-owner-id',
          tenantId: 'tenant-1',
          mid: 'mid-1',
        }),
      );
    });
  });

  describe('GET /admin/me/role', () => {
    it('returns current user role', async () => {
      adminService.getUserRole.mockResolvedValue('member');

      const result = await controller.getMyRole(mockSession);

      expect(result).toEqual({ role: 'member' });
    });
  });
});
