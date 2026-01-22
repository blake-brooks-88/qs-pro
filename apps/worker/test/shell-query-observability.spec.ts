import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { JsonLogger } from '../src/common/logger/json-logger.service';

describe('Shell Query Observability', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    // Apply the same configuration as main.ts
    configureApp(app);

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should have /metrics endpoint returning Prometheus format', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const res = await fastify.inject({ method: 'GET', url: '/metrics' });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('shell_query_jobs_total');
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('should deny access to Bull Board without admin key', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const res = await fastify.inject({ method: 'GET', url: '/admin/queues' });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.message).toContain('Unauthorized');
  });

  it('should allow access to Bull Board with valid admin key', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const res = await fastify.inject({
      method: 'GET',
      url: '/admin/queues',
      headers: { 'x-admin-key': 'test_api_key' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('JsonLogger should output JSON when LOG_FORMAT is json', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.LOG_FORMAT = 'json';
    
    const logger = new JsonLogger();
    logger.log('test message', 'TestContext');
    
    expect(consoleSpy).toHaveBeenCalled();
    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output).toMatchObject({
        level: 'log',
        message: 'test message',
        context: 'TestContext'
    });
    
    process.env.LOG_FORMAT = undefined;
    consoleSpy.mockRestore();
  });
});
