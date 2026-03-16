import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AppError, ErrorCode, SessionGuard } from '@qpp/backend-shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { CsrfGuard } from '../auth/csrf.guard';
import { Audited } from '../common/decorators/audited.decorator';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';
import { RequireRole } from './require-role.decorator';
import { RolesGuard } from './roles.guard';

const ChangeRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

const TransferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid(),
});

@Controller('admin')
@UseGuards(SessionGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('members')
  @UseGuards(RolesGuard)
  @RequireRole('owner', 'admin')
  async listMembers(@CurrentUser() user: UserSession) {
    const members = await this.adminService.listMembers(
      user.tenantId,
      user.mid,
    );
    return { members };
  }

  @Patch('members/:id/role')
  @UseGuards(RolesGuard)
  @RequireRole('owner', 'admin')
  @UseGuards(CsrfGuard)
  @Audited('role.changed', { targetIdParam: 'id' })
  async changeRole(
    @CurrentUser() user: UserSession,
    @Param('id', new ParseUUIDPipe({ version: '4' })) targetUserId: string,
    @Body(new ZodValidationPipe(ChangeRoleSchema))
    body: z.infer<typeof ChangeRoleSchema>,
    @Req() req: FastifyRequest,
  ) {
    const actorRole = await this.adminService.getUserRole(user.userId);

    await this.adminService.changeRole({
      actorId: user.userId,
      actorRole,
      targetUserId,
      newRole: body.role,
      tenantId: user.tenantId,
      mid: user.mid,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { ok: true };
  }

  @Post('transfer-ownership')
  @UseGuards(RolesGuard)
  @RequireRole('owner')
  @UseGuards(CsrfGuard)
  @Audited('role.ownership_transferred')
  async transferOwnership(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(TransferOwnershipSchema))
    body: z.infer<typeof TransferOwnershipSchema>,
    @Req() req: FastifyRequest,
  ) {
    await this.adminService.transferOwnership({
      currentOwnerId: user.userId,
      newOwnerId: body.newOwnerId,
      tenantId: user.tenantId,
      mid: user.mid,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { ok: true };
  }

  @Delete('members/:id')
  @UseGuards(RolesGuard)
  @RequireRole('owner', 'admin')
  @UseGuards(CsrfGuard)
  @Audited('user.deleted', { targetIdParam: 'id' })
  async deleteUser(
    @CurrentUser() user: UserSession,
    @Param('id', new ParseUUIDPipe({ version: '4' })) targetUserId: string,
  ) {
    if (user.userId === targetUserId) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
        reason: 'Cannot delete yourself.',
      });
    }
    await this.adminService.deleteUser({
      actorId: user.userId,
      targetUserId,
      tenantId: user.tenantId,
      mid: user.mid,
    });
    return { ok: true };
  }

  @Delete('tenant')
  @UseGuards(RolesGuard)
  @RequireRole('owner')
  @UseGuards(CsrfGuard)
  @Audited('tenant.soft_deleted')
  async softDeleteTenant(@CurrentUser() user: UserSession) {
    await this.adminService.softDeleteTenant(user.tenantId, user.userId);
    return { ok: true, gracePeriodDays: 30 };
  }

  @Get('me/role')
  async getMyRole(@CurrentUser() user: UserSession) {
    const role = await this.adminService.getUserRole(user.userId);
    return { role };
  }
}
