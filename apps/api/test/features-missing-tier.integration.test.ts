import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { RlsContextService, SessionGuard } from '@qpp/backend-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApp } from '../src/configure-app';
import { FeaturesController } from '../src/features/features.controller';
import { FeaturesService } from '../src/features/features.service';
import { TrialService } from '../src/trial/trial.service';

describe('FeaturesController missing org_subscriptions row (integration)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeaturesController],
      providers: [
        FeaturesService,
        {
          provide: 'FEATURE_OVERRIDE_REPOSITORY',
          useValue: {
            findByTenantId: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: 'TENANT_REPOSITORY',
          useValue: {
            findById: vi.fn().mockResolvedValue({
              id: 'tenant-1',
              eid: 'eid-1',
              tssd: 'test-tssd',
              auditRetentionDays: 365,
              installedAt: new Date(),
            }),
          },
        },
        {
          provide: 'ORG_SUBSCRIPTION_REPOSITORY',
          useValue: {
            findByTenantId: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TrialService,
          useValue: {
            getTrialState: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: RlsContextService,
          useValue: {
            runWithTenantContext: (_t: string, _m: string, fn: () => unknown) =>
              fn(),
          },
        },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({
        canActivate: vi.fn().mockImplementation((ctx: unknown) => {
          const request = (
            ctx as {
              switchToHttp: () => { getRequest: () => Record<string, unknown> };
            }
          )
            .switchToHttp()
            .getRequest();

          request.user = {
            userId: 'user-1',
            tenantId: 'tenant-1',
            mid: 'mid-1',
          };

          return true;
        }),
      })
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await configureApp(app, { globalPrefix: false });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('defaults to free tier when no org_subscriptions row exists', async () => {
    const response = await app.inject({ method: 'GET', url: '/features' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tier).toBe('free');
    expect(body.features.basicLinting).toBe(true);
    expect(body.features.advancedAutocomplete).toBe(false);
    expect(body.trial).toBeNull();
  });
});
