/**
 * SSE API Backfill Integration Tests
 *
 * Tests server-side logic for SSE connection handling:
 * - 404 for unknown runs (ownership verification)
 * - Rate limiting enforcement
 * - Correct user isolation
 *
 * Note: SSE streaming behavior (cached events, live events) is tested in
 * shell-query-sse.service.unit.test.ts which can properly test the Observable
 * without HTTP streaming complications.
 *
 * Test Strategy:
 * - Lightweight NestJS module with ShellQueryController and ShellQuerySseService
 * - Redis stub for rate limit simulation
 * - Behavioral assertions on HTTP responses for error cases
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService, SessionGuard } from '@qpp/backend-shared';
import {
  createRedisStub,
  createSessionGuardMock,
  createShellQueryServiceStub,
  createTenantRepoStub,
  type RedisStub,
  resetFactories,
} from '@qpp/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApp } from '../src/configure-app';
import { ShellQueryController } from '../src/shell-query/shell-query.controller';
import { ShellQueryService } from '../src/shell-query/shell-query.service';
import { ShellQuerySseService } from '../src/shell-query/shell-query-sse.service';

describe('SSE API Backfill (integration)', () => {
  let app: NestFastifyApplication;
  let mockRedis: RedisStub;
  let mockShellQueryService: ReturnType<typeof createShellQueryServiceStub>;
  let mockTenantRepo: ReturnType<typeof createTenantRepoStub>;
  let encryptionService: {
    encrypt: ReturnType<typeof vi.fn>;
    decrypt: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    resetFactories();
    mockRedis = createRedisStub();
    mockShellQueryService = createShellQueryServiceStub();
    mockTenantRepo = createTenantRepoStub();

    // Simple encryption stub that passes through values for testing
    encryptionService = {
      encrypt: vi.fn((value: string) => `enc:${value}`),
      decrypt: vi.fn((value: string) =>
        value.startsWith('enc:') ? value.slice(4) : value,
      ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ShellQueryController],
      providers: [
        { provide: ShellQueryService, useValue: mockShellQueryService },
        ShellQuerySseService,
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
        { provide: 'TENANT_REPOSITORY', useValue: mockTenantRepo },
        { provide: EncryptionService, useValue: encryptionService },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue(createSessionGuardMock())
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await configureApp(app, { globalPrefix: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app?.close();
  });

  describe('SSE /runs/:runId/events ownership verification', () => {
    it('returns 404 when run is not found', async () => {
      // Arrange - run lookup returns null (not found or unauthorized)
      mockShellQueryService.getRun.mockResolvedValue(null);

      // Act
      const res = await app.inject({
        method: 'GET',
        url: '/runs/unknown-run-id/events',
      });

      // Assert - observable behavior: 404 response with error details
      expect(res.statusCode).toBe(404);
      expect(res.json().type).toBe('urn:qpp:error:http-404');
      expect(res.json().detail).toBeTruthy();
    });

    it('verifies ownership before returning events', async () => {
      // Arrange - service returns null indicating unauthorized access
      mockShellQueryService.getRun.mockResolvedValue(null);

      // Act
      const res = await app.inject({
        method: 'GET',
        url: '/runs/someone-elses-run/events',
      });

      // Assert - ownership verified via service call with user context
      expect(mockShellQueryService.getRun).toHaveBeenCalledWith(
        'someone-elses-run',
        'tenant-1',
        'mid-1',
        'user-1',
      );
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for run belonging to different tenant', async () => {
      // Arrange - run exists but belongs to different tenant
      // Service returns null due to RLS filtering
      mockShellQueryService.getRun.mockResolvedValue(null);

      // Act
      const res = await app.inject({
        method: 'GET',
        url: '/runs/other-tenants-run/events',
      });

      // Assert
      expect(res.statusCode).toBe(404);
      expect(res.json().type).toBe('urn:qpp:error:http-404');
    });

    it('returns 404 for run belonging to different user', async () => {
      // Arrange - run exists but belongs to different user
      mockShellQueryService.getRun.mockResolvedValue(null);

      // Act
      const res = await app.inject({
        method: 'GET',
        url: '/runs/other-users-run/events',
      });

      // Assert
      expect(res.statusCode).toBe(404);
    });
  });

  describe('SSE /runs/:runId/events rate limiting', () => {
    it('enforces rate limit at 5 concurrent SSE connections per user', async () => {
      // Arrange - run exists but user has exceeded limit
      mockShellQueryService.getRun.mockResolvedValue({
        id: 'run-1',
        status: 'running',
      });
      mockRedis.incr.mockResolvedValue(6); // 6th connection attempt

      // Act
      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1/events',
      });

      // Assert - observable behavior: 429 with rate limit error
      expect(res.statusCode).toBe(429);
      expect(res.json().type).toBe('urn:qpp:error:rate-limit-exceeded');

      // Verify connection counter was decremented after rejection
      expect(mockRedis.decr).toHaveBeenCalled();
    });

    it('rejects 6th concurrent connection', async () => {
      // Arrange
      mockShellQueryService.getRun.mockResolvedValue({
        id: 'run-1',
        status: 'running',
      });
      mockRedis.incr.mockResolvedValue(6); // 6th connection - exceeds limit

      // Act
      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1/events',
      });

      // Assert - 6th connection rejected
      expect(res.statusCode).toBe(429);
      expect(mockRedis.decr).toHaveBeenCalled();
    });

    it('rate limit error includes context', async () => {
      // Arrange
      mockShellQueryService.getRun.mockResolvedValue({
        id: 'run-1',
        status: 'running',
      });
      mockRedis.incr.mockResolvedValue(6);

      // Act
      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1/events',
      });

      // Assert - error response includes helpful context
      expect(res.statusCode).toBe(429);
      const body = res.json();
      expect(body.type).toBe('urn:qpp:error:rate-limit-exceeded');
      expect(body.detail).toBeTruthy();
    });
  });
});
