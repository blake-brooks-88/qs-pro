import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IUserRepository } from '@qpp/database';
import type { OrgRole } from '@qpp/shared-types';

import { ROLES_KEY } from './require-role.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject('USER_REPOSITORY')
    private readonly userRepo: IUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<
      OrgRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const sessionUser = request.user as
      | { userId?: string; tenantId?: string }
      | undefined;

    if (!sessionUser?.userId) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const user = await this.userRepo.findById(sessionUser.userId);

    if (!user) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (user.tenantId !== sessionUser.tenantId) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Insufficient permissions. Required role: ${requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
