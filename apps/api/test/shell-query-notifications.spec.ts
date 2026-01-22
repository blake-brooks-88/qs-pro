import { HttpException, HttpStatus } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionGuard } from '@qpp/backend-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApp } from '../src/configure-app';
import { ShellQueryController } from '../src/shell-query/shell-query.controller';
import { ShellQueryService } from '../src/shell-query/shell-query.service';
import { ShellQuerySseService } from '../src/shell-query/shell-query-sse.service';
import {
  createRedisStub,
  createSessionGuardMock,
  createShellQueryServiceStub,
  createTenantRepoStub,
} from './stubs';

let mockRedis: ReturnType<typeof createRedisStub>;
let mockShellQueryService: ReturnType<typeof createShellQueryServiceStub>;
let mockTenantRepo: ReturnType<typeof createTenantRepoStub>;

describe('Shell Query Notifications & Results (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    mockRedis = createRedisStub();
    mockShellQueryService = createShellQueryServiceStub();
    mockTenantRepo = createTenantRepoStub();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ShellQueryController],
      providers: [
        { provide: ShellQueryService, useValue: mockShellQueryService },
        ShellQuerySseService,
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
        { provide: 'TENANT_REPOSITORY', useValue: mockTenantRepo },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue(createSessionGuardMock())
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureApp(app, { globalPrefix: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app.close();
  });

  describe('GET /runs/:runId/results', () => {
    it('should return paginated data', async () => {
      mockShellQueryService.getResults.mockResolvedValue({
        items: [{ id: 1 }],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1/results?page=1',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [{ id: 1 }] });
      expect(mockShellQueryService.getResults).toHaveBeenCalledWith(
        'run-1',
        'tenant-1',
        'user-1',
        'mid-1',
        1,
      );
    });

    it('should return 400 for invalid page', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1/results?page=0',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().type).toBe('urn:qpp:error:http-400');
      expect(res.json().detail).toBeTruthy();
    });

    it('should return 400 for page > 50', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1/results?page=51',
      });
      expect(res.statusCode).toBe(400);
      expect(String(res.json().detail)).toContain(
        'Page number exceeds maximum of 50',
      );
      expect(res.json().type).toBe('urn:qpp:error:http-400');
    });

    it('should return 409 when job still running', async () => {
      mockShellQueryService.getResults.mockRejectedValue(
        new HttpException('Run is still running', HttpStatus.CONFLICT),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1/results?page=1',
      });
      expect(res.statusCode).toBe(409);
      expect(String(res.json().detail)).toContain('Run is still running');
      expect(res.json().type).toBe('urn:qpp:error:http-409');
    });

    it('should return 404 when run not found', async () => {
      mockShellQueryService.getResults.mockRejectedValue(
        new HttpException('Run not found', HttpStatus.NOT_FOUND),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1/results?page=1',
      });
      expect(res.statusCode).toBe(404);
      expect(String(res.json().detail)).toContain('Run not found');
      expect(res.json().type).toBe('urn:qpp:error:http-404');
    });

    it('should return 409 when job failed', async () => {
      mockShellQueryService.getResults.mockRejectedValue(
        new HttpException(
          'Run failed: Query execution error',
          HttpStatus.CONFLICT,
        ),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1/results?page=1',
      });
      expect(res.statusCode).toBe(409);
      expect(String(res.json().detail)).toContain('Run failed');
      expect(res.json().type).toBe('urn:qpp:error:http-409');
    });
  });

  describe('SSE /runs/:runId/events', () => {
    it('should return 404 when run not found or unauthorized', async () => {
      mockShellQueryService.getRun.mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1/events',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().type).toBe('urn:qpp:error:http-404');
      expect(res.json().detail).toBeTruthy();
    });

    it('should enforce rate limiting', async () => {
      mockShellQueryService.getRun.mockResolvedValueOnce({ id: 'run-1' });
      mockRedis.incr.mockResolvedValueOnce(6);

      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1/events',
      });
      expect(res.statusCode).toBe(429);
      expect(res.json().type).toBe('urn:qpp:error:rate-limit-exceeded');
      expect(res.json().detail).toBeTruthy();

      expect(mockRedis.decr).toHaveBeenCalled();
    });
  });
});
