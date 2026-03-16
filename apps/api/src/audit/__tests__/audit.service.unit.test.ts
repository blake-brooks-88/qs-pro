import { Logger } from '@nestjs/common';
import type { AuditLogQueryParams } from '@qpp/shared-types';
import { createRlsContextStub, type RlsContextStub } from '@qpp/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IAuditLogRepository } from '../audit.repository';
import { type AuditLogEntry, AuditService } from '../audit.service';
import type { AuditLogRowResolved } from '../drizzle-audit-log.repository';

const TENANT_ID = 'tenant-1';
const MID = 'mid-100';
const USER_ID = 'user-abc';

function createFullEntry(overrides?: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    eventType: 'saved_query.created',
    actorType: 'user',
    actorId: USER_ID,
    tenantId: TENANT_ID,
    mid: MID,
    targetId: 'sq-1',
    metadata: { queryName: 'My Query' },
    ipAddress: '127.0.0.1',
    userAgent: 'vitest/1.0',
    ...overrides,
  };
}

function createAuditLogRepoStub(): {
  [K in keyof IAuditLogRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let repoStub: ReturnType<typeof createAuditLogRepoStub>;
  let rlsStub: RlsContextStub;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    repoStub = createAuditLogRepoStub();
    rlsStub = createRlsContextStub();
    service = new AuditService(
      repoStub as unknown as IAuditLogRepository,
      rlsStub as any,
    );

    loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  describe('log()', () => {
    it('calls rlsContext.runWithTenantContext with correct tenantId and mid', async () => {
      const entry = createFullEntry();

      await service.log(entry);

      expect(rlsStub.runWithTenantContext).toHaveBeenCalledOnce();
      expect(rlsStub.runWithTenantContext).toHaveBeenCalledWith(
        TENANT_ID,
        MID,
        expect.any(Function),
      );
    });

    it('calls repo.insert with all fields mapped correctly', async () => {
      const entry = createFullEntry();

      await service.log(entry);

      expect(repoStub.insert).toHaveBeenCalledOnce();
      expect(repoStub.insert).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        mid: MID,
        eventType: 'saved_query.created',
        actorType: 'user',
        actorId: USER_ID,
        targetId: 'sq-1',
        metadata: { queryName: 'My Query' },
        ipAddress: '127.0.0.1',
        userAgent: 'vitest/1.0',
      });
    });

    it('defaults metadata to null when undefined', async () => {
      const entry = createFullEntry({ metadata: undefined });

      await service.log(entry);

      expect(repoStub.insert).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: null }),
      );
    });

    it('defaults ipAddress to null when undefined', async () => {
      const entry = createFullEntry({ ipAddress: undefined });

      await service.log(entry);

      expect(repoStub.insert).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: null }),
      );
    });

    it('defaults userAgent to null when undefined', async () => {
      const entry = createFullEntry({ userAgent: undefined });

      await service.log(entry);

      expect(repoStub.insert).toHaveBeenCalledWith(
        expect.objectContaining({ userAgent: null }),
      );
    });

    it('defaults all optional fields to null when omitted', async () => {
      const entry: AuditLogEntry = {
        eventType: 'auth.login',
        actorType: 'system',
        actorId: null,
        tenantId: TENANT_ID,
        mid: MID,
        targetId: null,
      };

      await service.log(entry);

      expect(repoStub.insert).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        mid: MID,
        eventType: 'auth.login',
        actorType: 'system',
        actorId: null,
        targetId: null,
        metadata: null,
        ipAddress: null,
        userAgent: null,
      });
    });

    it('swallows repo.insert errors and does not throw', async () => {
      repoStub.insert.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.log(createFullEntry())).resolves.toBeUndefined();
    });

    it('logs the error when repo.insert fails', async () => {
      const dbError = new Error('DB connection lost');
      repoStub.insert.mockRejectedValue(dbError);

      await service.log(createFullEntry());

      expect(loggerErrorSpy).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to write audit log event=saved_query.created',
        dbError.stack,
      );
    });

    it('logs non-Error values as strings when repo.insert fails', async () => {
      repoStub.insert.mockRejectedValue('string failure');

      await service.log(createFullEntry());

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to write audit log event=saved_query.created',
        'string failure',
      );
    });

    it('swallows rlsContext errors and does not throw', async () => {
      rlsStub.runWithTenantContext.mockRejectedValue(
        new Error('RLS context failure'),
      );

      await expect(service.log(createFullEntry())).resolves.toBeUndefined();
    });
  });

  describe('findAll()', () => {
    const defaultParams: AuditLogQueryParams = {
      page: 1,
      pageSize: 25,
      sortBy: 'createdAt',
      sortDir: 'desc',
    };

    it('delegates to rlsContext.runWithTenantContext with correct tenantId and mid', async () => {
      await service.findAll(TENANT_ID, MID, defaultParams);

      expect(rlsStub.runWithTenantContext).toHaveBeenCalledOnce();
      expect(rlsStub.runWithTenantContext).toHaveBeenCalledWith(
        TENANT_ID,
        MID,
        expect.any(Function),
      );
    });

    it('passes params to repo.findAll', async () => {
      const params: AuditLogQueryParams = {
        page: 2,
        pageSize: 50,
        eventType: 'auth.login',
        sortBy: 'eventType',
        sortDir: 'asc',
      };

      await service.findAll(TENANT_ID, MID, params);

      expect(repoStub.findAll).toHaveBeenCalledOnce();
      expect(repoStub.findAll).toHaveBeenCalledWith(params);
    });

    it('returns items and total from repo.findAll', async () => {
      const mockRow = {
        id: 'row-1',
        eventType: 'auth.login',
      } as AuditLogRowResolved;
      repoStub.findAll.mockResolvedValue({ items: [mockRow], total: 1 });

      const result = await service.findAll(TENANT_ID, MID, defaultParams);

      expect(result).toEqual({ items: [mockRow], total: 1 });
    });

    it('propagates errors from repo.findAll (does not swallow)', async () => {
      repoStub.findAll.mockRejectedValue(new Error('query failed'));

      await expect(
        service.findAll(TENANT_ID, MID, defaultParams),
      ).rejects.toThrow('query failed');
    });
  });

  describe('SIEM integration', () => {
    let siemService: AuditService;
    let siemRepoStub: ReturnType<typeof createAuditLogRepoStub>;
    let siemRlsStub: RlsContextStub;
    let mockSiemProducer: { enqueue: ReturnType<typeof vi.fn> };
    let mockSiemRepo: {
      findByTenantId: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      siemRepoStub = createAuditLogRepoStub();
      siemRlsStub = createRlsContextStub();
      mockSiemProducer = { enqueue: vi.fn().mockResolvedValue(undefined) };
      mockSiemRepo = {
        findByTenantId: vi.fn(),
      };

      siemService = new AuditService(
        siemRepoStub as unknown as IAuditLogRepository,
        siemRlsStub as any,
        mockSiemProducer as any,
        mockSiemRepo as any,
      );
    });

    it('enqueues SIEM webhook when config is enabled', async () => {
      mockSiemRepo.findByTenantId.mockResolvedValue({
        enabled: true,
        webhookUrl: 'https://x.com',
        secretEncrypted: 'enc:s',
      });

      await siemService.log(createFullEntry());
      await vi.waitFor(() => {
        expect(mockSiemProducer.enqueue).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TENANT_ID,
            webhookUrl: 'https://x.com',
          }),
        );
      });
    });

    it('skips SIEM enqueue when no config exists', async () => {
      mockSiemRepo.findByTenantId.mockResolvedValue(undefined);

      await siemService.log(createFullEntry());
      await vi.waitFor(() => {
        expect(siemRepoStub.insert).toHaveBeenCalled();
      });
      expect(mockSiemProducer.enqueue).not.toHaveBeenCalled();
    });

    it('skips SIEM enqueue when config is disabled', async () => {
      mockSiemRepo.findByTenantId.mockResolvedValue({
        enabled: false,
        webhookUrl: 'https://x.com',
        secretEncrypted: 'enc:s',
      });

      await siemService.log(createFullEntry());
      await vi.waitFor(() => {
        expect(siemRepoStub.insert).toHaveBeenCalled();
      });
      expect(mockSiemProducer.enqueue).not.toHaveBeenCalled();
    });

    it('does not prevent audit log write when SIEM enqueue fails', async () => {
      mockSiemRepo.findByTenantId.mockResolvedValue({
        enabled: true,
        webhookUrl: 'https://x.com',
        secretEncrypted: 'enc:s',
      });
      mockSiemProducer.enqueue.mockRejectedValue(new Error('queue down'));

      await expect(siemService.log(createFullEntry())).resolves.toBeUndefined();
      expect(siemRepoStub.insert).toHaveBeenCalledOnce();
    });
  });
});
