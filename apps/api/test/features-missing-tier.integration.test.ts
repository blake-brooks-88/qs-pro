import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionGuard } from '@qpp/backend-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApp } from '../src/configure-app';
import { FeaturesController } from '../src/features/features.controller';
import { FeaturesService } from '../src/features/features.service';

describe('FeaturesController error cases (integration)', () => {
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
              subscriptionTier: '' as never,
              seatLimit: null,
              installedAt: new Date(),
            }),
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

  it('returns 500 when tenant subscription tier is missing', async () => {
    const response = await app.inject({ method: 'GET', url: '/features' });

    expect(response.statusCode).toBe(500);
    expect(response.json().type).toBe('urn:qpp:error:internal-server-error');
  });
});
