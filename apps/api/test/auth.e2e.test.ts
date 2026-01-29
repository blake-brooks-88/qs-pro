import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { ITenantRepository, IUserRepository } from '@qpp/database';
import { externalOnlyOnUnhandledRequest } from '@qpp/test-utils';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { agent as superagent } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- `key` is a trusted string, not user input
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const server = setupServer(
  http.post('https://test-tssd.auth.marketingcloudapis.com/v2/token', () => {
    return HttpResponse.json({
      access_token: 'e2e-access-token',
      refresh_token: 'e2e-refresh-token',
      expires_in: 3600,
      rest_instance_url: 'https://test-rest.com',
      soap_instance_url: 'https://test-soap.com',
      scope: 'read write',
      token_type: 'Bearer',
    });
  }),
  http.get('https://test-tssd.auth.marketingcloudapis.com/v2/userinfo', () => {
    return HttpResponse.json({
      sub: 'sf-user-123',
      enterprise_id: 'eid-123',
      member_id: 'mid-123',
      email: 'user@example.com',
      name: 'Example User',
    });
  }),
);

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: externalOnlyOnUnhandledRequest() });

    process.env.MCE_TSSD = 'test-tssd';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await configureApp(app, {
      globalPrefix: false,
      session: {
        secret: getRequiredEnv('SESSION_SECRET'),
        salt: getRequiredEnv('SESSION_SALT'),
        cookie: {
          secure: false,
          sameSite: 'lax',
        },
      },
      rls: true,
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    server.close();
    await app.close();
  });

  it('/auth/login (POST) should handle MCE JWT and set session', async () => {
    const testAgent = superagent(app.getHttpServer());
    const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
    const encodedSecret = new TextEncoder().encode(secret);

    const payload = {
      user_id: 'sf-user-jwt',
      enterprise_id: 'eid-jwt',
      member_id: 'mid-jwt',
      stack: 'test-tssd',
    };

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(encodedSecret);

    const response = await testAgent
      .post('/auth/login')
      .send({ jwt })
      .expect(302);

    expect(response.headers.location).toBe('/');

    const userRepo: IUserRepository = app.get('USER_REPOSITORY');
    const user = await userRepo.findBySfUserId('sf-user-jwt');
    expect(user).toBeDefined();
    expect(user?.sfUserId).toBe('sf-user-jwt');

    const meResponse = await testAgent.get('/auth/me').expect(200);

    expect(meResponse.body.user.id).toBe(user?.id);
    expect(meResponse.body.tenant.eid).toBe('eid-jwt');
  });

  it('/auth/callback (GET) should save credentials and return user', async () => {
    const testAgent = superagent(app.getHttpServer());

    const loginResponse = await testAgent
      .get('/auth/login')
      .query({ tssd: 'test-tssd' })
      .expect(302);

    const redirectUrl = loginResponse.headers.location;
    expect(redirectUrl).toBeDefined();
    if (!redirectUrl) {
      throw new Error('redirectUrl expected');
    }
    const state = new URL(redirectUrl).searchParams.get('state');

    expect(state).toBeDefined();

    const response = await testAgent
      .get('/auth/callback')
      .query({
        code: 'any-code',
        state,
        sf_user_id: 'sf-user-123',
        eid: 'eid-123',
        mid: 'mid-123',
      })
      .expect(302);

    expect(response.headers.location).toBe('/');

    const meResponse = await testAgent.get('/auth/me').expect(200);

    expect(meResponse.body.user.sfUserId).toBe('sf-user-123');

    const tenantRepo: ITenantRepository = app.get('TENANT_REPOSITORY');
    const tenant = await tenantRepo.findByEid('eid-123');
    expect(tenant).toBeDefined();
  });

  it('/auth/refresh (GET) should return a new access token', async () => {
    const testAgent = superagent(app.getHttpServer());
    const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
    const encodedSecret = new TextEncoder().encode(secret);

    const payload = {
      user_id: 'sf-user-refresh',
      enterprise_id: 'eid-refresh',
      member_id: 'mid-refresh',
      stack: 'test-tssd',
    };

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(encodedSecret);

    await testAgent.post('/auth/login').send({ jwt }).expect(302);

    const response = await testAgent.get('/auth/refresh').expect(200);

    expect(response.body.ok).toBe(true);
  });
});
