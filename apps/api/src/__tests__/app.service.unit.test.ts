import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppService } from '../app.service';

describe('AppService', () => {
  let service: AppService;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockExecute = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: 'DATABASE',
          useValue: {
            execute: mockExecute,
          },
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  describe('getHello', () => {
    it('returns Hello World greeting', () => {
      // Act
      const result = service.getHello();

      // Assert
      expect(result).toBe('Hello World!');
    });
  });

  describe('checkDatabaseHealth', () => {
    it('returns healthy status when database query succeeds', async () => {
      // Arrange
      mockExecute.mockResolvedValue([{ '?column?': 1 }]);

      // Act
      const result = await service.checkDatabaseHealth();

      // Assert
      expect(result.status).toBe('ok');
      expect(result.db).toBe('up');
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('returns unhealthy status when database query fails', async () => {
      // Arrange
      mockExecute.mockRejectedValue(new Error('Connection refused'));

      // Act
      const result = await service.checkDatabaseHealth();

      // Assert
      expect(result.status).toBe('degraded');
      expect(result.db).toBe('down');
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });
});
