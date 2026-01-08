import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ShellQueryController } from '../src/shell-query/shell-query.controller';
import { ShellQueryService } from '../src/shell-query/shell-query.service';
import { getQueueToken } from '@nestjs/bullmq';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionGuard } from '../src/auth/session.guard';
import { RlsContextService } from '../src/database/rls-context.service';
import { MceBridgeService } from '../src/mce/mce-bridge.service';
import { createMockShellQueryContext } from './factories';
import {
  createDbStub,
  createQueueStub,
  createRlsContextStub,
  createTenantRepoStub,
  createMceBridgeStub,
  createSessionGuardMock,
} from './stubs';

// Mock dependencies
const mockQueue = createQueueStub();
const mockDb = createDbStub();
const mockRlsContext = createRlsContextStub();
const mockTenantRepo = createTenantRepoStub();
const mockMceBridge = createMceBridgeStub();

describe('Shell Query Producer (e2e)', () => {
  let app: NestFastifyApplication;
  let service: ShellQueryService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ShellQueryController],
      providers: [
        ShellQueryService,
        { provide: getQueueToken('shell-query'), useValue: mockQueue },
        { provide: 'DATABASE', useValue: mockDb },
        { provide: RlsContextService, useValue: mockRlsContext },
        { provide: 'TENANT_REPOSITORY', useValue: mockTenantRepo },
        { provide: 'REDIS_CLIENT', useValue: {} },
        { provide: MceBridgeService, useValue: mockMceBridge },
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
    service = moduleFixture.get<ShellQueryService>(ShellQueryService);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRun', () => {
    it('should add a job to the queue with correct payload', async () => {
      // Mock active runs count to 0
      mockDb.setWhereResult([{ count: 0 }]);

      const context = createMockShellQueryContext();
      const sqlText = 'SELECT * FROM _Subscribers';
      const snippetName = 'My Query';

      const runId = await service.createRun(context, sqlText, snippetName);

      expect(runId).toBeDefined();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'execute-shell-query',
        expect.objectContaining({
          runId,
          tenantId: context.tenantId,
          userId: context.userId,
          mid: context.mid,
          sqlText,
          snippetName,
        }),
        expect.any(Object),
      );

      // Verify DB insert was called
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw if rate limit exceeded', async () => {
      // Mock active runs count to 10
      mockDb.setWhereResult([{ count: 10 }]);

      const context = createMockShellQueryContext();
      const sqlText = 'SELECT 1';

      await expect(service.createRun(context, sqlText)).rejects.toThrow(
        'Rate limit exceeded',
      );

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should generate a unique runId', async () => {
      mockDb.setWhereResult([{ count: 0 }]); // Reset for each call
      const context = createMockShellQueryContext({
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        eid: 'e1',
        accessToken: 'a1',
      });
      const runId1 = await service.createRun(context, 'SELECT 1', 'S1');
      const runId2 = await service.createRun(context, 'SELECT 1', 'S1');
      expect(runId1).not.toBe(runId2);
    });
  });

  describe('POST /runs', () => {
    it('should return 201 and runId on success', async () => {
      mockDb.setWhereResult([{ count: 0 }]);

      return request(app.getHttpServer())
        .post('/runs')
        .send({ sqlText: 'SELECT 1', snippetName: 'Test' })
        .expect(201)
        .expect((res) => {
          expect(res.body.runId).toBeDefined();
          expect(res.body.status).toBe('queued');
        });
    });

    it('should return 429 when rate limit exceeded', async () => {
      mockDb.setWhereResult([{ count: 10 }]);

      return request(app.getHttpServer())
        .post('/runs')
        .send({ sqlText: 'SELECT 1' })
        .expect(429);
    });
  });
});
