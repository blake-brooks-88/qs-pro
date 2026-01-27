import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  const mockAppService = {
    getHello: vi.fn().mockReturnValue('Hello World!'),
    checkDatabaseHealth: vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: '2024-01-01T00:00:00.000Z',
      db: 'up',
    }),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
      expect(appService.getHello).toHaveBeenCalled();
    });
  });

  describe('health', () => {
    it('should return health status', async () => {
      const result = await appController.getHealth();

      expect(result).toEqual({
        status: 'ok',
        timestamp: '2024-01-01T00:00:00.000Z',
        db: 'up',
      });
      expect(appService.checkDatabaseHealth).toHaveBeenCalled();
    });
  });
});
