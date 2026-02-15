import { BadRequestException } from '@nestjs/common';
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

      // Act
      const result = await controller.findAll(mockUser, {});

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

      // Act & Assert
      await expect(controller.findAll(mockUser, {})).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
      await expect(controller.findAll(mockUser, {})).rejects.toBeInstanceOf(
        AppError,
      );
    });

    it('throws BadRequestException for invalid query params', async () => {
      // Arrange — page = -1 violates .min(1)
      const invalidQuery = { page: '-1' };

      // Act & Assert
      await expect(controller.findAll(mockUser, invalidQuery)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('applies default query params when none are provided', async () => {
      // Arrange
      vi.mocked(auditService.findAll).mockResolvedValue({
        items: [],
        total: 0,
      });

      // Act
      const result = await controller.findAll(mockUser, {});

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

      // Act
      const result = await controller.findAll(mockUser, {});

      // Assert
      const item = result.items[0];
      expect(item).toEqual({
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
      expect(typeof item.createdAt).toBe('string');
    });

    it('passes custom query params through to the service', async () => {
      // Arrange
      vi.mocked(auditService.findAll).mockResolvedValue({
        items: [],
        total: 0,
      });

      const query = {
        page: '2',
        pageSize: '10',
        eventType: 'saved_query.created',
        sortBy: 'eventType',
        sortDir: 'asc',
      };

      // Act
      await controller.findAll(mockUser, query);

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

    it('throws BadRequestException when pageSize exceeds maximum', async () => {
      // Arrange — pageSize max is 100
      const invalidQuery = { pageSize: '101' };

      // Act & Assert
      await expect(controller.findAll(mockUser, invalidQuery)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('checks features before validating query params', async () => {
      // Arrange — feature disabled AND invalid params
      featuresService = createMockFeaturesService(false);
      controller = new AuditController(auditService, featuresService);

      const invalidQuery = { page: '-1' };

      // Act & Assert — should throw AppError (feature check), not BadRequestException (validation)
      await expect(
        controller.findAll(mockUser, invalidQuery),
      ).rejects.toBeInstanceOf(AppError);
    });
  });
});
