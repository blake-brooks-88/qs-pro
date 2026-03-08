import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { auth } from '../auth/auth.js';
import { BackofficeAuditService } from '../audit/audit.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

type BackofficeRole = 'viewer' | 'editor' | 'admin';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly auditService: BackofficeAuditService,
  ) {}

  @Get('users')
  @Roles('admin')
  async listUsers(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await auth.api.listUsers({
      query: {
        limit: limit ? parseInt(limit, 10) : 25,
        offset: offset ? parseInt(offset, 10) : 0,
      },
    });

    return {
      users: result.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        banned: u.banned ?? false,
        createdAt: u.createdAt,
      })),
      total: result.total,
    };
  }

  @Post('users/invite')
  @Roles('admin')
  async inviteUser(
    @Body()
    body: {
      email: string;
      name: string;
      role: BackofficeRole;
      temporaryPassword: string;
    },
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    // Better Auth's admin plugin types constrain role to "user" | "admin",
    // but our config uses custom roles (viewer/editor/admin). Cast needed.
    const response = await (auth.api.createUser as (args: {
      body: { email: string; name: string; password: string; role: string };
    }) => Promise<{ user: { id: string; email: string; name: string; role: string } }>)({
      body: {
        email: body.email,
        name: body.name,
        password: body.temporaryPassword,
        role: body.role,
      },
    });

    void this.auditService.log({
      backofficeUserId: user.id,
      eventType: 'backoffice.user_invited',
      metadata: { invitedEmail: body.email, role: body.role },
      ipAddress: req.ip,
    });

    return {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
      role: response.user.role,
    };
  }

  @Patch('users/:userId/role')
  @Roles('admin')
  async changeUserRole(
    @Param('userId') userId: string,
    @Body() body: { role: BackofficeRole },
    @CurrentUser() currentUser: { id: string },
    @Req() req: FastifyRequest,
  ) {
    if (currentUser.id === userId && body.role !== 'admin') {
      throw new BadRequestException('Cannot demote yourself from admin');
    }

    // Better Auth types constrain role to "user" | "admin" but our config
    // uses custom roles (viewer/editor/admin). Cast via unknown needed.
    await (auth.api.setRole as unknown as (args: {
      body: { userId: string; role: string };
    }) => Promise<unknown>)({
      body: { userId, role: body.role },
    });

    void this.auditService.log({
      backofficeUserId: currentUser.id,
      eventType: 'backoffice.user_role_changed',
      metadata: { targetUserId: userId, newRole: body.role },
      ipAddress: req.ip,
    });

    return { success: true };
  }

  @Post('users/:userId/ban')
  @Roles('admin')
  async banUser(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: { id: string },
    @Req() req: FastifyRequest,
  ) {
    if (currentUser.id === userId) {
      throw new BadRequestException('Cannot ban yourself');
    }

    await auth.api.banUser({
      body: { userId },
    });

    void this.auditService.log({
      backofficeUserId: currentUser.id,
      eventType: 'backoffice.user_banned',
      metadata: { targetUserId: userId },
      ipAddress: req.ip,
    });

    return { success: true };
  }

  @Post('users/:userId/unban')
  @Roles('admin')
  async unbanUser(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: { id: string },
    @Req() req: FastifyRequest,
  ) {
    await auth.api.unbanUser({
      body: { userId },
    });

    void this.auditService.log({
      backofficeUserId: currentUser.id,
      eventType: 'backoffice.user_unbanned',
      metadata: { targetUserId: userId },
      ipAddress: req.ip,
    });

    return { success: true };
  }
}
