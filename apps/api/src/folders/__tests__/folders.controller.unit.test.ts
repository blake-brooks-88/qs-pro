import { Test, type TestingModule } from '@nestjs/testing';
import { SessionGuard } from '@qpp/backend-shared';
import { createMockUserSession, resetFactories } from '@qpp/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CsrfGuard } from '../../auth/csrf.guard';
import type { UserSession } from '../../common/decorators/current-user.decorator';
import { FoldersController } from '../folders.controller';
import { FoldersService } from '../folders.service';

function createServiceStub() {
  return {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

describe('FoldersController', () => {
  let controller: FoldersController;
  let service: ReturnType<typeof createServiceStub>;

  const mockUser = createMockUserSession() as UserSession;

  beforeEach(async () => {
    resetFactories();
    vi.resetAllMocks();

    service = createServiceStub();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FoldersController],
      providers: [{ provide: FoldersService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(FoldersController);
  });

  describe('POST create()', () => {
    it('delegates to service.create() with parsed body and maps response', async () => {
      const now = new Date('2026-02-14T12:00:00.000Z');
      service.create.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Folder 1',
        parentId: null,
        visibility: 'personal',
        userId: mockUser.userId,
        createdAt: now,
        updatedAt: now,
      });

      const result = await controller.create(mockUser, {
        name: 'Folder 1',
        parentId: null,
      });

      expect(service.create).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        { name: 'Folder 1', parentId: null },
      );
      expect(result).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Folder 1',
        parentId: null,
        visibility: 'personal',
        userId: mockUser.userId,
        createdAt: '2026-02-14T12:00:00.000Z',
        updatedAt: '2026-02-14T12:00:00.000Z',
      });
    });
  });

  describe('GET findAll()', () => {
    it('delegates to service.findAll() and maps dates', async () => {
      const now = new Date('2026-02-14T12:00:00.000Z');
      service.findAll.mockResolvedValue([
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Folder 1',
          parentId: null,
          visibility: 'personal',
          userId: mockUser.userId,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = await controller.findAll(mockUser);

      expect(service.findAll).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
      );
      expect(result[0]?.createdAt).toBe('2026-02-14T12:00:00.000Z');
    });
  });

  describe('GET findById()', () => {
    it('delegates to service.findById() and maps response', async () => {
      const now = new Date('2026-02-14T12:00:00.000Z');
      service.findById.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Folder 1',
        parentId: null,
        visibility: 'personal',
        userId: mockUser.userId,
        createdAt: now,
        updatedAt: now,
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
      expect(result.name).toBe('Folder 1');
    });
  });

  describe('PATCH update()', () => {
    it('delegates to service.update() with parsed body and maps response', async () => {
      const now = new Date('2026-02-14T12:00:00.000Z');
      service.update.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Updated',
        parentId: null,
        visibility: 'personal',
        userId: mockUser.userId,
        createdAt: now,
        updatedAt: now,
      });

      const result = await controller.update(
        mockUser,
        '550e8400-e29b-41d4-a716-446655440000',
        { name: 'Updated' },
      );

      expect(service.update).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        '550e8400-e29b-41d4-a716-446655440000',
        { name: 'Updated' },
      );
      expect(result.name).toBe('Updated');
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
