import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, HttpException } from '@nestjs/common';
import request from 'supertest';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ShellQueryController } from '../src/shell-query/shell-query.controller';
import { ShellQueryService } from '../src/shell-query/shell-query.service';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionGuard } from '../src/auth/session.guard';
import {
  createRedisStub,
  createShellQueryServiceStub,
  createTenantRepoStub,
  createSessionGuardMock,
} from './stubs';

const mockRedis = createRedisStub();
const mockShellQueryService = createShellQueryServiceStub();
const mockTenantRepo = createTenantRepoStub();

describe('Shell Query Notifications & Results (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ShellQueryController],
      providers: [
        { provide: ShellQueryService, useValue: mockShellQueryService },
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

      const res = await request(app.getHttpServer())
        .get('/runs/run-1/results?page=1')
        .expect(200);

      expect(res.body).toEqual({ items: [{ id: 1 }] });
      expect(mockShellQueryService.getResults).toHaveBeenCalledWith(
        'run-1',
        'tenant-1',
        'user-1',
        'mid-1',
        1,
      );
    });

    it('should return 400 for invalid page', async () => {
      await request(app.getHttpServer())
        .get('/runs/run-1/results?page=0')
        .expect(400);
    });

    it('should return 400 for page > 50', async () => {
      await request(app.getHttpServer())
        .get('/runs/run-1/results?page=51')
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain(
            'Page number exceeds maximum of 50',
          );
        });
    });

    it('should return 409 when job still running', async () => {
      mockShellQueryService.getResults.mockRejectedValue(
        new HttpException('Run is still running', HttpStatus.CONFLICT),
      );

      await request(app.getHttpServer())
        .get('/runs/run-1/results?page=1')
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toContain('Run is still running');
        });
    });

    it('should return 404 when run not found', async () => {
      mockShellQueryService.getResults.mockRejectedValue(
        new HttpException('Run not found', HttpStatus.NOT_FOUND),
      );

      await request(app.getHttpServer())
        .get('/runs/run-1/results?page=1')
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toContain('Run not found');
        });
    });

    it('should return 409 when job failed', async () => {
      mockShellQueryService.getResults.mockRejectedValue(
        new HttpException(
          'Run failed: Query execution error',
          HttpStatus.CONFLICT,
        ),
      );

      await request(app.getHttpServer())
        .get('/runs/run-1/results?page=1')
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toContain('Run failed');
        });
    });
  });

  describe('SSE /runs/:runId/events', () => {
    it('should require authentication and ownership', async () => {
      mockShellQueryService.getRun.mockResolvedValue(null);

      await request(app.getHttpServer()).get('/runs/run-1/events').expect(400);
    });

    it('should enforce rate limiting', async () => {
      mockShellQueryService.getRun.mockResolvedValue({ id: 'run-1' });
      mockRedis.incr.mockResolvedValue(6); // Exceed limit

      await request(app.getHttpServer()).get('/runs/run-1/events').expect(429);

      expect(mockRedis.decr).toHaveBeenCalled();
    });
  });
});
