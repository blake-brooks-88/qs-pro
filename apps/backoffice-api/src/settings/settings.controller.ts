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
} from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";

import { BackofficeAuditService } from "../audit/audit.service.js";
import { getAuth } from "../auth/auth.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { Roles } from "../auth/roles.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import {
  type ChangeRoleDto,
  ChangeRoleSchema,
  type InviteUserDto,
  InviteUserSchema,
  type ListUsersQuery,
  ListUsersQuerySchema,
  type ResetPasswordDto,
  ResetPasswordSchema,
} from "./settings.types.js";

@Controller("settings")
export class SettingsController {
  constructor(private readonly auditService: BackofficeAuditService) {}

  @Get("users")
  @Roles("admin")
  async listUsers(
    @Req() req: FastifyRequest,
    @Query(new ZodValidationPipe(ListUsersQuerySchema)) query: ListUsersQuery,
  ) {
    const result = await getAuth().api.listUsers({
      headers: fromNodeHeaders(req.headers),
      query: {
        limit: query.limit,
        offset: query.offset,
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

  @Post("users/invite")
  @Roles("admin")
  async inviteUser(
    @Body(new ZodValidationPipe(InviteUserSchema))
    body: InviteUserDto,
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const response = await (
      getAuth().api.createUser as unknown as (args: {
        headers: Headers;
        body: { email: string; name: string; password: string; role: string };
      }) => Promise<{
        user: { id: string; email: string; name: string; role: string };
      }>
    )({
      headers: fromNodeHeaders(req.headers),
      body: {
        email: body.email,
        name: body.name ?? "",
        password: body.temporaryPassword,
        role: body.role,
      },
    });

    void this.auditService.log({
      backofficeUserId: user.id,
      eventType: "backoffice.user_invited",
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

  @Patch("users/:userId/role")
  @Roles("admin")
  async changeUserRole(
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(ChangeRoleSchema)) body: ChangeRoleDto,
    @CurrentUser() currentUser: { id: string },
    @Req() req: FastifyRequest,
  ) {
    if (currentUser.id === userId && body.role !== "admin") {
      throw new BadRequestException("Cannot demote yourself from admin");
    }

    await (
      getAuth().api.setRole as unknown as (args: {
        headers: Headers;
        body: { userId: string; role: string };
      }) => Promise<unknown>
    )({
      headers: fromNodeHeaders(req.headers),
      body: { userId, role: body.role },
    });

    void this.auditService.log({
      backofficeUserId: currentUser.id,
      eventType: "backoffice.user_role_changed",
      metadata: { targetUserId: userId, newRole: body.role },
      ipAddress: req.ip,
    });

    return { success: true };
  }

  @Post("users/:userId/ban")
  @Roles("admin")
  async banUser(
    @Param("userId") userId: string,
    @CurrentUser() currentUser: { id: string },
    @Req() req: FastifyRequest,
  ) {
    if (currentUser.id === userId) {
      throw new BadRequestException("Cannot ban yourself");
    }

    await getAuth().api.banUser({
      headers: fromNodeHeaders(req.headers),
      body: { userId },
    });

    void this.auditService.log({
      backofficeUserId: currentUser.id,
      eventType: "backoffice.user_banned",
      metadata: { targetUserId: userId },
      ipAddress: req.ip,
    });

    return { success: true };
  }

  @Post("users/:userId/unban")
  @Roles("admin")
  async unbanUser(
    @Param("userId") userId: string,
    @CurrentUser() currentUser: { id: string },
    @Req() req: FastifyRequest,
  ) {
    await getAuth().api.unbanUser({
      headers: fromNodeHeaders(req.headers),
      body: { userId },
    });

    void this.auditService.log({
      backofficeUserId: currentUser.id,
      eventType: "backoffice.user_unbanned",
      metadata: { targetUserId: userId },
      ipAddress: req.ip,
    });

    return { success: true };
  }

  @Post("users/:userId/reset-password")
  @Roles("admin")
  async resetUserPassword(
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordDto,
    @CurrentUser() currentUser: { id: string },
    @Req() req: FastifyRequest,
  ) {
    await (
      getAuth().api.setUserPassword as unknown as (args: {
        headers: Headers;
        body: { userId: string; newPassword: string };
      }) => Promise<unknown>
    )({
      headers: fromNodeHeaders(req.headers),
      body: { userId, newPassword: body.newPassword },
    });

    void this.auditService.log({
      backofficeUserId: currentUser.id,
      eventType: "backoffice.user_password_reset",
      metadata: { targetUserId: userId },
      ipAddress: req.ip,
    });

    return { success: true };
  }

  @Post("users/:userId/remove")
  @Roles("admin")
  async removeUser(
    @Param("userId") userId: string,
    @CurrentUser() currentUser: { id: string },
    @Req() req: FastifyRequest,
  ) {
    if (currentUser.id === userId) {
      throw new BadRequestException("Cannot delete yourself");
    }

    await (
      getAuth().api.removeUser as unknown as (args: {
        headers: Headers;
        body: { userId: string };
      }) => Promise<unknown>
    )({
      headers: fromNodeHeaders(req.headers),
      body: { userId },
    });

    void this.auditService.log({
      backofficeUserId: currentUser.id,
      eventType: "backoffice.user_deleted",
      metadata: { targetUserId: userId },
      ipAddress: req.ip,
    });

    return { success: true };
  }
}
