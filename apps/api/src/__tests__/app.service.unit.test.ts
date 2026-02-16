import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppService } from '../app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  describe('getHello', () => {
    it('returns Hello World greeting', () => {
      const result = service.getHello();

      expect(result).toBe('Hello World!');
    });
  });
});
