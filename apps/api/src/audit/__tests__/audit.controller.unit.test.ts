import { AppError, ErrorCode } from '@qpp/backend-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserSession } from '../../common/decorators/current-user.decorator';
import type { FeaturesService } from '../../features/features.service';
import { AuditController } from '../audit.controller';
import type { AuditService } from '../audit.service';
import type { AuditLogRow } from '../drizzle-audit-log.repository';

const mockUser: UserSession = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  mid: '12345',
};

const mockAuditLogRow: AuditLogRow = {
  id: 'log-1',
  tenantId: 'tenant-1',
  mid: '12345',
  eventType: 'saved_query.created',
  actorType: 'user' as const,
  actorId: 'user-1',
  targetId: 'sq-1',
  metadata: { name: 'My Query' },
  ipAddress: '127.0.0.1',
  userAgent: 'TestAgent',
  createdAt: new Date('2026-02-14T12:00:00Z'),
};

function createMockAuditService() {
  return {
    findAll: vi.fn(),
  } as unknown as AuditService;
}

function createMockFeaturesService(auditLogsEnabled = true) {
  return {
    getTenantFeatures: vi.fn().mockResolvedValue({
      tier: 'enterprise',
      features: { auditLogs: auditLogsEnabled },
    }),
  } as unknown as FeaturesService;
}

describe('AuditController', () => {
  let controller: AuditController;
  let auditService: AuditService;
  let featuresService: FeaturesService;

  beforeEach(() => {
    auditService = createMockAuditService();
    featuresService = createMockFeaturesService(true);
    controller = new AuditController(auditService, featuresService);
  });

  describe('GET /audit-logs (findAll)', () => {
    it('returns paginated response with items mapped through toResponse', async () => {
      // Arrange
      const secondRow: AuditLogRow = {
        ...mockAuditLogRow,
        id: 'log-2',
        eventType: 'folder.created',
        targetId: 'folder-1',
        metadata: null,
        createdAt: new Date('2026-02-14T13:00:00Z'),
      };

      vi.mocked(auditService.findAll).mockResolvedValue({
        items: [mockAuditLogRow, secondRow],
        total: 2,
      });

      // Act — pipe applies defaults before reaching the method
      const result = await controller.findAll(mockUser, {
        page: 1,
        pageSize: 25,
        sortBy: 'createdAt',
        sortDir: 'desc',
      });

      // Assert
      expect(result).toEqual({
        items: [
          {
            id: 'log-1',
            tenantId: 'tenant-1',
            mid: '12345',
            eventType: 'saved_query.created',
            actorType: 'user',
            actorId: 'user-1',
            targetId: 'sq-1',
            metadata: { name: 'My Query' },
            ipAddress: '127.0.0.1',
            userAgent: 'TestAgent',
            createdAt: '2026-02-14T12:00:00.000Z',
          },
          {
            id: 'log-2',
            tenantId: 'tenant-1',
            mid: '12345',
            eventType: 'folder.created',
            actorType: 'user',
            actorId: 'user-1',
            targetId: 'folder-1',
            metadata: null,
            ipAddress: '127.0.0.1',
            userAgent: 'TestAgent',
            createdAt: '2026-02-14T13:00:00.000Z',
          },
        ],
        total: 2,
        page: 1,
        pageSize: 25,
      });
    });

    it('throws AppError with FEATURE_NOT_ENABLED when auditLogs feature is false', async () => {
      // Arrange
      featuresService = createMockFeaturesService(false);
      controller = new AuditController(auditService, featuresService);

      // Act & Assert — pipe applies defaults before reaching the method
      const params = {
        page: 1,
        pageSize: 25,
        sortBy: 'createdAt' as const,
        sortDir: 'desc' as const,
      };
      await expect(controller.findAll(mockUser, params)).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
      await expect(controller.findAll(mockUser, params)).rejects.toBeInstanceOf(
        AppError,
      );
    });

    it('applies default query params when none are provided', async () => {
      // Arrange
      vi.mocked(auditService.findAll).mockResolvedValue({
        items: [],
        total: 0,
      });

      // Act — pipe applies schema defaults before reaching the method
      const result = await controller.findAll(mockUser, {
        page: 1,
        pageSize: 25,
        sortBy: 'createdAt',
        sortDir: 'desc',
      });

      // Assert — service receives parsed defaults
      expect(auditService.findAll).toHaveBeenCalledWith(
        'tenant-1',
        '12345',
        expect.objectContaining({
          page: 1,
          pageSize: 25,
          sortBy: 'createdAt',
          sortDir: 'desc',
        }),
      );
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
    });

    it('maps AuditLogRow to response format correctly', async () => {
      // Arrange — row with nullable fields set to null
      const nullableRow: AuditLogRow = {
        ...mockAuditLogRow,
        actorId: null,
        targetId: null,
        metadata: null,
        ipAddress: null,
        userAgent: null,
      };

      vi.mocked(auditService.findAll).mockResolvedValue({
        items: [nullableRow],
        total: 1,
      });

      // Act — pipe applies defaults before reaching the method
      const result = await controller.findAll(mockUser, {
        page: 1,
        pageSize: 25,
        sortBy: 'createdAt',
        sortDir: 'desc',
      });

      // Assert
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: mockAuditLogRow.id,
        tenantId: mockAuditLogRow.tenantId,
        mid: mockAuditLogRow.mid,
        eventType: mockAuditLogRow.eventType,
        actorType: mockAuditLogRow.actorType,
        actorId: null,
        targetId: null,
        metadata: null,
        ipAddress: null,
        userAgent: null,
        createdAt: '2026-02-14T12:00:00.000Z',
      });
      expect(typeof result.items[0]?.createdAt).toBe('string');
    });

    it('passes custom query params through to the service', async () => {
      // Arrange
      vi.mocked(auditService.findAll).mockResolvedValue({
        items: [],
        total: 0,
      });

      // Pipe parses and coerces query strings before reaching the method
      const params = {
        page: 2,
        pageSize: 10,
        eventType: 'saved_query.created',
        sortBy: 'eventType' as const,
        sortDir: 'asc' as const,
      };

      // Act
      await controller.findAll(mockUser, params);

      // Assert
      expect(auditService.findAll).toHaveBeenCalledWith(
        'tenant-1',
        '12345',
        expect.objectContaining({
          page: 2,
          pageSize: 10,
          eventType: 'saved_query.created',
          sortBy: 'eventType',
          sortDir: 'asc',
        }),
      );
    });
  });
});
