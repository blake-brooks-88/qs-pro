import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { SessionGuard } from '@qpp/backend-shared';
import { createMockUserSession, resetFactories } from '@qpp/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CsrfGuard } from '../../auth/csrf.guard';
import type { UserSession } from '../../common/decorators/current-user.decorator';
import { QueryVersionsController } from '../query-versions.controller';
import { QueryVersionsService } from '../query-versions.service';

function createServiceStub() {
  return {
    listVersions: vi.fn(),
    listPublishEvents: vi.fn(),
    getVersionDetail: vi.fn(),
    restore: vi.fn(),
    updateName: vi.fn(),
  };
}

describe('QueryVersionsController', () => {
  let controller: QueryVersionsController;
  let service: ReturnType<typeof createServiceStub>;

  const mockUser = createMockUserSession() as UserSession;

  beforeEach(async () => {
    resetFactories();
    vi.resetAllMocks();

    service = createServiceStub();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueryVersionsController],
      providers: [{ provide: QueryVersionsService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(QueryVersionsController);
  });

  describe('GET listVersions()', () => {
    it('delegates to service with correct args and returns response', async () => {
      const expected = {
        versions: [{ id: 'v-1', savedQueryId: 'sq-1' }],
        total: 1,
      };
      service.listVersions.mockResolvedValue(expected);

      const result = await controller.listVersions(mockUser, 'sq-1');

      expect(service.listVersions).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        'sq-1',
      );
      expect(result).toEqual(expected);
    });
  });

  describe('GET listPublishEvents()', () => {
    it('delegates to service with correct args and returns response', async () => {
      const expected = {
        events: [{ id: 'pe-1', versionId: 'v-1' }],
        total: 1,
      };
      service.listPublishEvents.mockResolvedValue(expected);

      const result = await controller.listPublishEvents(mockUser, 'sq-1');

      expect(service.listPublishEvents).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        'sq-1',
      );
      expect(result).toEqual(expected);
    });
  });

  describe('GET getVersionDetail()', () => {
    it('delegates to service with correct args and returns response', async () => {
      const expected = {
        id: 'v-1',
        savedQueryId: 'sq-1',
        sqlText: 'SELECT 1',
        lineCount: 1,
      };
      service.getVersionDetail.mockResolvedValue(expected);

      const result = await controller.getVersionDetail(mockUser, 'sq-1', 'v-1');

      expect(service.getVersionDetail).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        'sq-1',
        'v-1',
      );
      expect(result).toEqual(expected);
    });
  });

  describe('POST restore()', () => {
    it('delegates to service with correct args and returns response', async () => {
      const expected = {
        id: 'v-restored',
        source: 'restore',
        restoredFromId: 'v-1',
      };
      service.restore.mockResolvedValue(expected);

      const result = await controller.restore(mockUser, 'sq-1', 'v-1');

      expect(service.restore).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        'sq-1',
        'v-1',
      );
      expect(result).toEqual(expected);
    });
  });

  describe('PATCH updateName()', () => {
    it('delegates to service with parsed body when valid', async () => {
      const expected = { id: 'v-1', versionName: 'My Save' };
      service.updateName.mockResolvedValue(expected);

      const result = await controller.updateName(mockUser, 'sq-1', 'v-1', {
        versionName: 'My Save',
      });

      expect(service.updateName).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        'sq-1',
        'v-1',
        { versionName: 'My Save' },
      );
      expect(result).toEqual(expected);
    });

    it('accepts null versionName to clear the name', async () => {
      const expected = { id: 'v-1', versionName: null };
      service.updateName.mockResolvedValue(expected);

      const result = await controller.updateName(mockUser, 'sq-1', 'v-1', {
        versionName: null,
      });

      expect(service.updateName).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.mid,
        mockUser.userId,
        'sq-1',
        'v-1',
        { versionName: null },
      );
      expect(result).toEqual(expected);
    });

    it('throws BadRequestException when body is empty', async () => {
      await expect(
        controller.updateName(mockUser, 'sq-1', 'v-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when versionName exceeds 255 chars', async () => {
      await expect(
        controller.updateName(mockUser, 'sq-1', 'v-1', {
          versionName: 'x'.repeat(256),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
