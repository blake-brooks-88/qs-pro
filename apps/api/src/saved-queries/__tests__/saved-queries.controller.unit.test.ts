import { Test, type TestingModule } from '@nestjs/testing';
import { SessionGuard } from '@qpp/backend-shared';
import { createMockUserSession, resetFactories } from '@qpp/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CsrfGuard } from '../../auth/csrf.guard';
import type { UserSession } from '../../common/decorators/current-user.decorator';
import { SavedQueriesController } from '../saved-queries.controller';
import { SavedQueriesService } from '../saved-queries.service';

function createServiceStub() {
  return {
    create: vi.fn(),
    findAllListItems: vi.fn(),
    countByUser: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

describe('SavedQueriesController', () => {
  let controller: SavedQueriesController;
  let service: ReturnType<typeof createServiceStub>;

  const mockUser = createMockUserSession() as UserSession;

  beforeEach(async () => {
    resetFactories();
    vi.resetAllMocks();

    service = createServiceStub();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SavedQueriesController],
      providers: [{ provide: SavedQueriesService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(SavedQueriesController);
  });

  describe('POST create()', () => {
    it('delegates to service.create() with parsed body and maps response', async () => {
      const now = new Date('2026-02-14T12:00:00.000Z');
      service.create.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'My Query',
        sqlText: 'SELECT 1',
        folderId: null,
        linkedQaObjectId: null,
        linkedQaCustomerKey: null,
        linkedQaName: null,
        linkedAt: null,
        latestVersionHash: null,
        updatedByUserName: null,
        createdAt: now,
        updatedAt: now,
      });

      const result = await controller.create(mockUser, {
        name: 'My Query',
        sqlText: 'SELECT 1',
        folderId: null,
      });

      expect(service.create).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        { name: 'My Query', sqlText: 'SELECT 1', folderId: null },
      );
      expect(result).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'My Query',
        sqlText: 'SELECT 1',
        folderId: null,
        createdAt: '2026-02-14T12:00:00.000Z',
        updatedAt: '2026-02-14T12:00:00.000Z',
        linkedQaObjectId: null,
        linkedQaCustomerKey: null,
        linkedQaName: null,
        linkedAt: null,
        latestVersionHash: null,
        updatedByUserName: null,
      });
    });
  });

  describe('GET findAll()', () => {
    it('returns list items mapped to ISO strings with updatedByUserName', async () => {
      service.findAllListItems.mockResolvedValue([
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Q1',
          folderId: null,
          updatedAt: new Date('2026-02-14T12:00:00.000Z'),
          linkedQaCustomerKey: null,
          linkedQaName: null,
          linkedAt: null,
          updatedByUserName: 'Jane Doe',
        },
      ]);

      const result = await controller.findAll(mockUser);

      expect(service.findAllListItems).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
      );
      expect(result).toEqual([
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Q1',
          folderId: null,
          updatedAt: '2026-02-14T12:00:00.000Z',
          linkedQaCustomerKey: null,
          linkedQaName: null,
          linkedAt: null,
          updatedByUserName: 'Jane Doe',
        },
      ]);
    });
  });

  describe('GET count()', () => {
    it('returns count from service', async () => {
      service.countByUser.mockResolvedValue(7);

      const result = await controller.count(mockUser);

      expect(service.countByUser).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
      );
      expect(result).toEqual({ count: 7 });
    });
  });

  describe('GET findById()', () => {
    it('delegates to service.findById() and maps response with latestVersionHash', async () => {
      const createdAt = new Date('2026-02-14T12:00:00.000Z');
      const updatedAt = new Date('2026-02-14T13:00:00.000Z');
      service.findById.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Q1',
        sqlText: 'SELECT 1',
        folderId: null,
        linkedQaObjectId: null,
        linkedQaCustomerKey: null,
        linkedQaName: null,
        linkedAt: null,
        latestVersionHash: 'abc123hash',
        updatedByUserName: 'John Smith',
        createdAt,
        updatedAt,
      });

      const result = await controller.findById(
        mockUser,
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(service.findById).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(result).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Q1',
        sqlText: 'SELECT 1',
        folderId: null,
        createdAt: '2026-02-14T12:00:00.000Z',
        updatedAt: '2026-02-14T13:00:00.000Z',
        linkedQaObjectId: null,
        linkedQaCustomerKey: null,
        linkedQaName: null,
        linkedAt: null,
        latestVersionHash: 'abc123hash',
        updatedByUserName: 'John Smith',
      });
    });
  });

  describe('PATCH update()', () => {
    it('delegates to service.update() with parsed body and maps response', async () => {
      const now = new Date('2026-02-14T12:00:00.000Z');
      service.update.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Renamed',
        sqlText: 'SELECT 2',
        folderId: null,
        linkedQaObjectId: null,
        linkedQaCustomerKey: null,
        linkedQaName: null,
        linkedAt: null,
        latestVersionHash: 'def456hash',
        updatedByUserName: 'Jane Doe',
        createdAt: now,
        updatedAt: now,
      });

      const result = await controller.update(
        mockUser,
        '550e8400-e29b-41d4-a716-446655440000',
        { name: 'Renamed' },
      );

      expect(service.update).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        '550e8400-e29b-41d4-a716-446655440000',
        { name: 'Renamed' },
      );
      expect(result.name).toBe('Renamed');
      expect(result.latestVersionHash).toBe('def456hash');
      expect(result.updatedByUserName).toBe('Jane Doe');
    });
  });

  describe('DELETE delete()', () => {
    it('delegates to service.delete() and returns {success:true}', async () => {
      service.delete.mockResolvedValue(undefined);

      const result = await controller.delete(
        mockUser,
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(service.delete).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(result).toEqual({ success: true });
    });
  });
});
