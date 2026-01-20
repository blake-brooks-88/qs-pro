import secureSession from '@fastify/secure-session';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { ITenantRepository, IUserRepository } from '@qpp/database';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './../src/app.module';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- `key` is a trusted string, not user input
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

function getFirstCookie(headers: { 'set-cookie'?: string[] }): string {
  const cookie = headers['set-cookie']?.[0];
  if (!cookie) {
    throw new Error('Expected set-cookie header');
  }
  return cookie;
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
    server.listen();

    process.env.MCE_CLIENT_ID = 'test-id';
    process.env.MCE_CLIENT_SECRET = 'test-secret';
    process.env.MCE_REDIRECT_URI = 'http://localhost/callback';
    process.env.MCE_TSSD = 'test-tssd';
    process.env.ENCRYPTION_KEY =
      '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    process.env.MCE_JWT_SIGNING_SECRET =
      'test-jwt-secret-at-least-32-chars-long';
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.register(secureSession, {
      secret: process.env.SESSION_SECRET,
      salt: '1234567890123456',
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    server.close();
    await app.close();
  });

  it('/auth/login (POST) should handle MCE JWT and set session', async () => {
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

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ jwt })
      .expect(302);

    expect(response.headers.location).toBe('/');
    const cookie = getFirstCookie(response.headers);

    // Verify user created
    const userRepo: IUserRepository = app.get('USER_REPOSITORY');
    const user = await userRepo.findBySfUserId('sf-user-jwt');
    expect(user).toBeDefined();
    expect(user?.sfUserId).toBe('sf-user-jwt');

    // Verify /auth/me works with the cookie
    const meResponse = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(meResponse.body.user.id).toBe(user?.id);
    expect(meResponse.body.tenant.eid).toBe('eid-jwt');
  });

  it('/auth/callback (GET) should save credentials and return user', async () => {
    const loginResponse = await request(app.getHttpServer())
      .get('/auth/login')
      .query({ tssd: 'test-tssd' })
      .expect(302);

    const loginCookie = getFirstCookie(loginResponse.headers);
    const redirectUrl = loginResponse.headers.location;
    expect(redirectUrl).toBeDefined();
    if (!redirectUrl) {
      throw new Error('redirectUrl expected');
    }
    const state = new URL(redirectUrl).searchParams.get('state');

    expect(state).toBeDefined();

    const response = await request(app.getHttpServer())
      .get('/auth/callback')
      .set('Cookie', loginCookie)
      .query({
        code: 'any-code',
        state,
        sf_user_id: 'sf-user-123',
        eid: 'eid-123',
        mid: 'mid-123',
      })
      .expect(302);

    expect(response.headers.location).toBe('/');
    const callbackCookie = getFirstCookie(response.headers);

    const meResponse = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', callbackCookie)
      .expect(200);

    expect(meResponse.body.user.sfUserId).toBe('sf-user-123');

    // Verify DB
    const tenantRepo: ITenantRepository = app.get('TENANT_REPOSITORY');
    const tenant = await tenantRepo.findByEid('eid-123');
    expect(tenant).toBeDefined();
  });

  it('/auth/refresh (GET) should return a new access token', async () => {
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

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ jwt })
      .expect(302);

    const refreshCookie = getFirstCookie(loginResponse.headers);

    const response = await request(app.getHttpServer())
      .get('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);

    expect(response.body.ok).toBe(true);
  });
});
