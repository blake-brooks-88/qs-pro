import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '@qpp/backend-shared';
import { z } from 'zod';

import { ShellQueryService } from '../shell-query.service';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RunExistsGuard implements CanActivate {
  constructor(private readonly shellQueryService: ShellQueryService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { runId } = request.params as { runId: string };
    const user = request.user as {
      userId: string;
      tenantId: string;
      mid: string;
    };

    const parsed = z.string().regex(UUID_V4_REGEX).safeParse(runId);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
        operation: 'streamEvents',
        runId,
      });
    }

    const run = await this.shellQueryService.getRun(
      runId,
      user.tenantId,
      user.mid,
      user.userId,
    );

    if (!run) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'streamEvents',
        runId,
      });
    }

    return true;
  }
}
