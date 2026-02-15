import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '@qpp/backend-shared';

import { ShellQueryService } from '../shell-query.service';

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
