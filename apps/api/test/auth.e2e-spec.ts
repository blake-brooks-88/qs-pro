import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ITenantRepository, IUserRepository } from '@qs-pro/database';
import * as jose from 'jose';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import secureSession from '@fastify/secure-session';

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
    const secret = process.env.MCE_JWT_SIGNING_SECRET!;
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
    expect(response.headers['set-cookie']).toBeDefined();
    const cookie = response.headers['set-cookie'][0];

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

    const loginCookie = loginResponse.headers['set-cookie'][0];
    const redirectUrl = loginResponse.headers.location;
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
    expect(response.headers['set-cookie']).toBeDefined();
    const cookie = response.headers['set-cookie'][0];

    const meResponse = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(meResponse.body.user.sfUserId).toBe('sf-user-123');

    // Verify DB
    const tenantRepo: ITenantRepository = app.get('TENANT_REPOSITORY');
    const tenant = await tenantRepo.findByEid('eid-123');
    expect(tenant).toBeDefined();
  });

  it('/auth/refresh (GET) should return a new access token', async () => {
    const secret = process.env.MCE_JWT_SIGNING_SECRET!;
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

    const cookie = loginResponse.headers['set-cookie'][0];

    const response = await request(app.getHttpServer())
      .get('/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.access_token).toBe('e2e-access-token');
  });
});
