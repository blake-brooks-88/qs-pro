import { getQueueToken } from '@nestjs/bullmq';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { RestDataService } from '@qpp/backend-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionGuard } from '../src/auth/session.guard';
import { configureApp } from '../src/configure-app';
import { ShellQueryController } from '../src/shell-query/shell-query.controller';
import { ShellQueryService } from '../src/shell-query/shell-query.service';
import { ShellQuerySseService } from '../src/shell-query/shell-query-sse.service';
import { createMockShellQueryContext } from './factories';
import {
  createQueueStub,
  createRestDataServiceStub,
  createSessionGuardMock,
  createShellQueryRunRepoStub,
  createShellQuerySseServiceStub,
  createTenantRepoStub,
} from './stubs';

let mockQueue: ReturnType<typeof createQueueStub>;
let mockTenantRepo: ReturnType<typeof createTenantRepoStub>;
let mockRestDataService: ReturnType<typeof createRestDataServiceStub>;
let mockRunRepo: ReturnType<typeof createShellQueryRunRepoStub>;
let mockSseService: ReturnType<typeof createShellQuerySseServiceStub>;

describe('Shell Query Producer (e2e)', () => {
  let app: NestFastifyApplication;
  let service: ShellQueryService;

  beforeEach(async () => {
    mockQueue = createQueueStub();
    mockTenantRepo = createTenantRepoStub();
    mockRestDataService = createRestDataServiceStub();
    mockRunRepo = createShellQueryRunRepoStub();
    mockSseService = createShellQuerySseServiceStub();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ShellQueryController],
      providers: [
        ShellQueryService,
        { provide: getQueueToken('shell-query'), useValue: mockQueue },
        { provide: 'TENANT_REPOSITORY', useValue: mockTenantRepo },
        { provide: RestDataService, useValue: mockRestDataService },
        { provide: 'SHELL_QUERY_RUN_REPOSITORY', useValue: mockRunRepo },
        { provide: ShellQuerySseService, useValue: mockSseService },
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
      mockRunRepo.countActiveRuns.mockResolvedValue(0);

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

      expect(mockRunRepo.createRun).toHaveBeenCalled();
    });

    it('should throw if rate limit exceeded', async () => {
      mockRunRepo.countActiveRuns.mockResolvedValue(10);

      const context = createMockShellQueryContext();
      const sqlText = 'SELECT 1';

      await expect(service.createRun(context, sqlText)).rejects.toThrow(
        'Rate limit exceeded',
      );

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should generate a unique runId', async () => {
      mockRunRepo.countActiveRuns.mockResolvedValue(0);
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
      mockRunRepo.countActiveRuns.mockResolvedValue(0);

      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        headers: { 'x-csrf-token': 'csrf-test' },
        payload: { sqlText: 'SELECT 1', snippetName: 'Test' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(
        expect.objectContaining({
          runId: expect.any(String),
          status: 'queued',
        }),
      );
    });

    it('should return 429 when rate limit exceeded', async () => {
      mockRunRepo.countActiveRuns.mockResolvedValue(10);

      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        headers: { 'x-csrf-token': 'csrf-test' },
        payload: { sqlText: 'SELECT 1' },
      });

      expect(res.statusCode).toBe(429);
      expect(res.json().type).toBe('urn:qpp:error:http-429');
      expect(res.json().detail).toBeTruthy();
    });
  });
});
