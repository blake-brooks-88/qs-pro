import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tap } from 'rxjs/operators';

import {
  AUDIT_EVENT_KEY,
  type AuditedOptions,
} from '../common/decorators/audited.decorator';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const auditOptions = this.reflector.get<AuditedOptions>(
      AUDIT_EVENT_KEY,
      context.getHandler(),
    );

    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | { userId: string; tenantId: string; mid: string }
      | undefined;

    if (!user?.tenantId || !user?.mid) {
      this.logger.debug(
        `Skipping audit log for ${auditOptions.eventType} — no user context`,
      );
      return next.handle();
    }

    return next.handle().pipe(
      tap((responseData) => {
        void this.auditService.log({
          eventType: auditOptions.eventType,
          actorType: 'user',
          actorId: user.userId ?? null,
          tenantId: user.tenantId,
          mid: user.mid,
          targetId: this.extractTargetId(request, auditOptions, responseData),
          metadata: this.buildMetadata(request, auditOptions),
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });
      }),
    );
  }

  private extractTargetId(
    request: { params?: Record<string, string> },
    options: AuditedOptions,
    responseData: unknown,
  ): string | null {
    if (options.targetIdParam) {
      const paramValue = request.params?.[options.targetIdParam];
      if (paramValue) {
        return paramValue;
      }
    }

    const response = responseData as Record<string, unknown> | null | undefined;
    if (response?.id && typeof response.id === 'string') {
      return response.id;
    }

    return null;
  }

  private buildMetadata(
    request: { body?: Record<string, unknown> },
    options: AuditedOptions,
  ): Record<string, unknown> | undefined {
    if (!options.metadataFields?.length) {
      return undefined;
    }

    const metadata: Record<string, unknown> = {};
    for (const field of options.metadataFields) {
      if (request.body && field in request.body) {
        metadata[field] = request.body[field];
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }
}
