import { ConfigService } from '@nestjs/config';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '@qpp/backend-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthController } from '../src/auth/auth.controller';
import { configureApp } from '../src/configure-app';

describe('AuthController session infrastructure errors (integration)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { handleJwtLogin: vi.fn() } },
        { provide: ConfigService, useValue: { get: vi.fn() } },
      ],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    // NOTE: No secure-session registration here; req.session should be undefined.
    await configureApp(app, { globalPrefix: false });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /auth/login returns 500 when session is not available', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { jwt: 'any-non-empty-jwt' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().type).toBe('urn:qpp:error:http-500');
  });
});
