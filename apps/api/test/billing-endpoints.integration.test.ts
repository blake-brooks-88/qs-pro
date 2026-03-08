import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { externalOnlyOnUnhandledRequest } from '@qpp/test-utils';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { agent as superagent } from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module';
import { BillingService } from '../src/billing/billing.service';
import { configureApp } from '../src/configure-app';

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const server = setupServer(
  http.post('https://test-tssd.auth.marketingcloudapis.com/v2/token', () => {
    return HttpResponse.json({
      access_token: 'billing-test-access-token',
      refresh_token: 'billing-test-refresh-token',
      expires_in: 3600,
      rest_instance_url: 'https://test-rest.com',
      soap_instance_url: 'https://test-soap.com',
      scope: 'read write',
      token_type: 'Bearer',
    });
  }),
  http.get('https://test-tssd.auth.marketingcloudapis.com/v2/userinfo', () => {
    return HttpResponse.json({
      sub: 'billing-test-user',
      enterprise_id: 'billing-test-eid',
      member_id: 'billing-test-mid',
      email: 'billing-test@example.com',
      name: 'Billing Test User',
    });
  }),
);

function createBillingServiceMock() {
  return {
    getPrices: vi.fn().mockResolvedValue({
      pro: { monthly: 29, annual: 20 },
    }),
    createCheckoutSession: vi.fn().mockResolvedValue({
      url: 'https://checkout.stripe.com/test-session',
    }),
    createPortalSession: vi.fn().mockResolvedValue({
      url: 'https://billing.stripe.com/test-portal',
    }),
    confirmCheckoutSession: vi.fn(),
  };
}

describe('Billing endpoints (integration)', () => {
  let app: NestFastifyApplication;
  let billingServiceMock: ReturnType<typeof createBillingServiceMock>;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: externalOnlyOnUnhandledRequest() });
    process.env.MCE_TSSD = 'test-tssd';

    billingServiceMock = createBillingServiceMock();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BillingService)
      .useValue(billingServiceMock)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await configureApp(app, {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    server.close();
    await app.close();
  });

  async function createAuthenticatedAgent(): Promise<{
    agent: ReturnType<typeof superagent>;
    csrfToken: string;
  }> {
    const testAgent = superagent(app.getHttpServer());
    const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
    const encodedSecret = new TextEncoder().encode(secret);
    const uniqueSuffix = Date.now().toString();

    const jwt = await new jose.SignJWT({
      user_id: `billing-user-${uniqueSuffix}`,
      enterprise_id: `billing-eid-${uniqueSuffix}`,
      member_id: `billing-mid-${uniqueSuffix}`,
      stack: 'test-tssd',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(encodedSecret);

    await testAgent.post('/api/auth/login').send({ jwt }).expect(302);

    const meResponse = await testAgent.get('/api/auth/me').expect(200);
    return {
      agent: testAgent,
      csrfToken: meResponse.body.csrfToken,
    };
  }

  it('POST /api/billing/checkout returns a checkout URL for authenticated users', async () => {
    const { agent, csrfToken } = await createAuthenticatedAgent();

    const response = await agent
      .post('/api/billing/checkout')
      .set('x-csrf-token', csrfToken)
      .send({ tier: 'pro', interval: 'monthly' })
      .expect(201);

    expect(response.body).toEqual({
      url: 'https://checkout.stripe.com/test-session',
    });
    expect(billingServiceMock.createCheckoutSession).toHaveBeenCalledWith(
      expect.any(String),
      'pro',
      'monthly',
    );
  });

  it('GET /api/billing/checkout-session/:sessionId returns fulfilled status for authenticated users', async () => {
    const { agent } = await createAuthenticatedAgent();
    billingServiceMock.confirmCheckoutSession.mockResolvedValue({
      status: 'fulfilled',
    });

    const response = await agent
      .get('/api/billing/checkout-session/cs_test_123')
      .expect(200);

    expect(response.body).toEqual({ status: 'fulfilled' });
    expect(billingServiceMock.confirmCheckoutSession).toHaveBeenCalledWith(
      expect.any(String),
      'cs_test_123',
    );
  });

  it('GET /api/billing/checkout-session/:sessionId returns failed with reason', async () => {
    const { agent } = await createAuthenticatedAgent();
    billingServiceMock.confirmCheckoutSession.mockResolvedValue({
      status: 'failed',
      reason: 'expired',
    });

    const response = await agent
      .get('/api/billing/checkout-session/cs_expired')
      .expect(200);

    expect(response.body).toEqual({
      status: 'failed',
      reason: 'expired',
    });
  });

  it('GET /api/billing/checkout-session/:sessionId returns 401 for unauthenticated requests', async () => {
    const testAgent = superagent(app.getHttpServer());

    await testAgent
      .get('/api/billing/checkout-session/cs_test_123')
      .expect(401);
  });
});
