import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAuthMiddleware } from '../src/common/middleware/admin-auth.middleware';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

// Test module that applies AdminAuthMiddleware to a test route
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [
        () => ({
          ADMIN_API_KEY: 'test-admin-key-123',
        }),
      ],
    }),
  ],
  controllers: [],
  providers: [AdminAuthMiddleware],
})
class TestAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AdminAuthMiddleware).forRoutes('/admin/*path');
  }
}

describe('AdminAuthMiddleware', () => {
  let app: NestFastifyApplication;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    // Add a test route to verify middleware behavior
    const fastifyInstance = app.getHttpAdapter().getInstance();
    fastifyInstance.get('/admin/test', async () => {
      return { message: 'Protected route accessed' };
    });
    fastifyInstance.get('/public/test', async () => {
      return { message: 'Public route accessed' };
    });

    configService = moduleFixture.get<ConfigService>(ConfigService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Admin routes protection', () => {
    it('should deny access without admin key', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({ method: 'GET', url: '/admin/test' });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.statusCode).toBe(401);
      expect(body.message).toContain('Unauthorized');
    });

    it('should deny access with incorrect admin key', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({
        method: 'GET',
        url: '/admin/test',
        headers: { 'x-admin-key': 'wrong-key' },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.statusCode).toBe(401);
      expect(body.message).toContain('Invalid or missing admin API key');
    });

    it('should allow access with correct admin key', async () => {
      const adminKey = configService.get<string>('ADMIN_API_KEY');
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({
        method: 'GET',
        url: '/admin/test',
        headers: { 'x-admin-key': adminKey! },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('Protected route accessed');
    });
  });

  describe('Public routes', () => {
    it('should allow access to public routes without admin key', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({ method: 'GET', url: '/public/test' });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('Public route accessed');
    });
  });
});

describe('AdminAuthMiddleware - No API Key Configured', () => {
  let app: NestFastifyApplication;
  let originalAdminKey: string | undefined;

  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true, // Ignore process.env completely
        load: [
          () => ({
            // Explicitly set ADMIN_API_KEY to undefined to test the "not configured" case
            ADMIN_API_KEY: undefined,
          }),
        ],
      }),
    ],
    providers: [AdminAuthMiddleware],
  })
  class NoKeyModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer.apply(AdminAuthMiddleware).forRoutes('/admin/*path');
    }
  }

  beforeAll(async () => {
    // Save and delete the env var to ensure it's not set
    originalAdminKey = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [NoKeyModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    const fastifyInstance = app.getHttpAdapter().getInstance();
    fastifyInstance.get('/admin/test', async () => {
      return { message: 'Protected route accessed' };
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    // Restore the original env var
    if (originalAdminKey !== undefined) {
      process.env.ADMIN_API_KEY = originalAdminKey;
    }
  });

  it('should deny access when ADMIN_API_KEY is not configured', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const res = await fastify.inject({ method: 'GET', url: '/admin/test' });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.statusCode).toBe(401);
    expect(body.message).toContain('Admin API key not configured');
  });

  it('should deny access even with a key header when ADMIN_API_KEY is not configured', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const res = await fastify.inject({
      method: 'GET',
      url: '/admin/test',
      headers: { 'x-admin-key': 'any-key' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.statusCode).toBe(401);
    expect(body.message).toContain('Admin API key not configured');
  });
});
