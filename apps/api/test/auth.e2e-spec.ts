import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDatabase, ITenantRepository, IUserRepository, ICredentialsRepository } from '@qs-pro/database';

const server = setupServer(
  http.post('https://test-tssd.auth.marketingcloudapis.com/v2/token', () => {
    return HttpResponse.json({
      access_token: 'e2e-access-token',
      refresh_token: 'e2e-refresh-token',
      expires_in: 3600,
      rest_instance_url: 'https://test-rest.com',
      soap_instance_url: 'https://test-soap.com',
      scope: 'read write',
      token_type: 'Bearer'
    });
  })
);

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let db: any;

  beforeAll(async () => {
    server.listen();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    db = app.get('DATABASE');
    
    // Set required ENVs for test
    process.env.SFMC_CLIENT_ID = 'test-id';
    process.env.SFMC_CLIENT_SECRET = 'test-secret';
    process.env.SFMC_REDIRECT_URI = 'http://localhost/callback';
    process.env.ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  });

  afterAll(async () => {
    server.close();
    await app.close();
  });

  it('/auth/callback (GET) should save credentials and return user', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/callback')
      .query({
        code: 'any-code',
        tssd: 'test-tssd',
        sf_user_id: 'sf-user-123',
        eid: 'eid-123'
      })
      .expect(200);

    expect(response.body.user).toBeDefined();
    expect(response.body.tenant).toBeDefined();
    expect(response.body.user.sfUserId).toBe('sf-user-123');

    // Verify DB
    const tenantRepo: ITenantRepository = app.get('TENANT_REPOSITORY');
    const tenant = await tenantRepo.findByEid('eid-123');
    expect(tenant).toBeDefined();
  });

  it('/auth/refresh (GET) should return a new access token', async () => {
    // We already have a user and tenant from previous test
    const tenantRepo: ITenantRepository = app.get('TENANT_REPOSITORY');
    const userRepo: IUserRepository = app.get('USER_REPOSITORY');
    
    const tenant = await tenantRepo.findByEid('eid-123');
    const user = await userRepo.findBySfUserId('sf-user-123');

    const response = await request(app.getHttpServer())
      .get('/auth/refresh')
      .query({
        tenantId: tenant!.id,
        userId: user!.id
      })
      .expect(200);

    expect(response.body.access_token).toBe('e2e-access-token');
  });
});
