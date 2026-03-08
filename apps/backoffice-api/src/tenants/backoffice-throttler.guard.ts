import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class BackofficeThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: FastifyRequest): Promise<string> {
    const request = req as FastifyRequest & {
      backofficeUser?: { id: string };
    };
    return request.backofficeUser?.id ?? req.ip;
  }
}
