import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';

type SecureSession = { get(key: string): unknown };
type SessionRequest = FastifyRequest & { session?: SecureSession };

@Injectable()
export class SessionThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const sessionReq = req as unknown as SessionRequest;
    const userId = sessionReq.session?.get('userId');
    if (typeof userId === 'string' && userId) {
      return userId;
    }
    return (req as unknown as FastifyRequest).ip ?? 'unknown';
  }
}
