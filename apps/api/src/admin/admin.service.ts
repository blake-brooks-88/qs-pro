import { Inject, Injectable, Logger } from '@nestjs/common';
import { RlsContextService } from '@qpp/backend-shared';
import { AppError, ErrorCode } from '@qpp/backend-shared';
import type { IUserRepository } from '@qpp/database';
import type { OrgRole } from '@qpp/shared-types';

import { AuditService } from '../audit/audit.service';

export interface MemberListItem {
  id: string;
  name: string | null;
  email: string | null;
  role: OrgRole;
  lastActiveAt: string | null;
  joinedAt: string | null;
}

interface ChangeRoleParams {
  actorId: string;
  actorRole: OrgRole;
  targetUserId: string;
  newRole: 'admin' | 'member';
  tenantId: string;
  mid: string;
  ipAddress?: string;
  userAgent?: string;
}

interface TransferOwnershipParams {
  currentOwnerId: string;
  newOwnerId: string;
  tenantId: string;
  mid: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject('USER_REPOSITORY')
    private readonly userRepo: IUserRepository,
    private readonly rlsContext: RlsContextService,
    private readonly auditService: AuditService,
  ) {}

  async getUserRole(userId: string): Promise<OrgRole> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        reason: `User not found: ${userId}`,
      });
    }
    return user.role;
  }

  async listMembers(tenantId: string, mid: string): Promise<MemberListItem[]> {
    const users = await this.rlsContext.runWithTenantContext(
      tenantId,
      mid,
      () => this.userRepo.findByTenantId(tenantId),
    );

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      lastActiveAt: user.lastActiveAt
        ? new Date(user.lastActiveAt).toISOString()
        : null,
      joinedAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    }));
  }

  async changeRole(params: ChangeRoleParams): Promise<void> {
    const {
      actorId,
      actorRole,
      targetUserId,
      newRole,
      tenantId,
      mid,
      ipAddress,
      userAgent,
    } = params;

    if (newRole !== 'admin' && newRole !== 'member') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
        reason:
          'Role must be admin or member. Use ownership transfer for owner.',
      });
    }

    if (actorRole !== 'owner' && actorRole !== 'admin') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
        reason: 'Only owners and admins can change roles.',
      });
    }

    const targetUser = await this.userRepo.findById(targetUserId);
    if (!targetUser) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        reason: `User not found: ${targetUserId}`,
      });
    }

    if (targetUser.tenantId !== tenantId) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
        reason: 'Target user does not belong to your organization.',
      });
    }

    if (targetUser.role === 'owner') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
        reason: 'Cannot change Owner role. Use ownership transfer instead.',
      });
    }

    if (actorId === targetUserId) {
      if (actorRole === 'owner') {
        throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
          reason: 'Owner cannot demote themselves. Transfer ownership first.',
        });
      }

      if (actorRole === 'admin' && newRole === 'member') {
        const adminCount = await this.userRepo.countByTenantIdAndRole(
          tenantId,
          'admin',
        );
        if (adminCount <= 1) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
            reason:
              'Cannot demote yourself. Promote another user to Admin first.',
          });
        }
      }
    }

    const previousRole = targetUser.role;

    await this.rlsContext.runWithTenantContext(tenantId, mid, () =>
      this.userRepo.updateRole(targetUserId, newRole),
    );

    this.logger.log(
      `Role changed: user=${targetUserId} ${previousRole} -> ${newRole} by actor=${actorId}`,
    );

    void this.auditService.log({
      eventType: 'role.changed',
      actorType: 'user',
      actorId,
      tenantId,
      mid,
      targetId: targetUserId,
      metadata: { previousRole, newRole, targetUserId },
      ipAddress,
      userAgent,
    });
  }

  async transferOwnership(params: TransferOwnershipParams): Promise<void> {
    const { currentOwnerId, newOwnerId, tenantId, mid, ipAddress, userAgent } =
      params;

    await this.rlsContext.runWithIsolatedTenantContext(
      tenantId,
      mid,
      async () => {
        const currentOwner = await this.userRepo.findById(currentOwnerId);
        if (currentOwner?.role !== 'owner') {
          throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
            reason: 'Current user is not the owner.',
          });
        }

        const newOwner = await this.userRepo.findById(newOwnerId);
        if (!newOwner) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            reason: `User not found: ${newOwnerId}`,
          });
        }

        if (newOwner.tenantId !== tenantId) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
            reason: 'Target user does not belong to your organization.',
          });
        }

        await this.userRepo.updateRole(currentOwnerId, 'admin');
        await this.userRepo.updateRole(newOwnerId, 'owner');
      },
    );

    this.logger.log(
      `Ownership transferred: ${currentOwnerId} -> ${newOwnerId} tenant=${tenantId}`,
    );

    void this.auditService.log({
      eventType: 'role.ownership_transferred',
      actorType: 'user',
      actorId: currentOwnerId,
      tenantId,
      mid,
      targetId: newOwnerId,
      metadata: { previousOwnerId: currentOwnerId, newOwnerId },
      ipAddress,
      userAgent,
    });
  }
}
