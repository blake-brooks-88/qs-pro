/**
 * Shell Query Observability Integration Tests
 *
 * Tests the observability infrastructure for the worker service.
 *
 * Test Strategy:
 * - Real NestJS application with AppModule
 * - Real Fastify HTTP adapter
 * - Real Prometheus metrics endpoint
 * - Real Bull Board admin interface
 * - No internal mocks - tests actual HTTP responses
 *
 * Covered Behaviors:
 * - Prometheus /metrics endpoint returns expected format and counters
 * - Bull Board /admin/queues requires authentication
 * - Bull Board grants access with valid admin key
 * - Health endpoint returns OK
 *
 * NOTE: The logging infrastructure (Pino) is tested in Phase 01.1.
 * These tests focus on HTTP-accessible observability endpoints.
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Shell Query Observability (integration)', () => {
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

  describe('Prometheus /metrics endpoint', () => {
    it('returns 200 OK with Prometheus text format', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({ method: 'GET', url: '/metrics' });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
    });

    it('includes shell_query_jobs_total counter', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({ method: 'GET', url: '/metrics' });

      expect(res.payload).toContain('shell_query_jobs_total');
    });

    it('includes HELP and TYPE annotations for metrics', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({ method: 'GET', url: '/metrics' });

      // Prometheus format requires HELP and TYPE annotations
      expect(res.payload).toContain('# HELP');
      expect(res.payload).toContain('# TYPE');
    });
  });

  describe('Bull Board /admin/queues endpoint', () => {
    it('denies access without admin key', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({
        method: 'GET',
        url: '/admin/queues',
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toContain('Unauthorized');
    });

    it('denies access with invalid admin key', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({
        method: 'GET',
        url: '/admin/queues',
        headers: { 'x-admin-key': 'invalid_key' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('grants access with valid admin key', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({
        method: 'GET',
        url: '/admin/queues',
        headers: { 'x-admin-key': 'test_api_key' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('returns HTML content for Bull Board UI', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({
        method: 'GET',
        url: '/admin/queues',
        headers: { 'x-admin-key': 'test_api_key' },
      });

      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  describe('Health endpoint', () => {
    it('returns 200 OK for health check', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const res = await fastify.inject({ method: 'GET', url: '/health' });

      expect(res.statusCode).toBe(200);
    });
  });
});
