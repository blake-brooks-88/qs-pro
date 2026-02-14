import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EncryptionService, RlsContextService } from '@qpp/backend-shared';
import { describe, expect, it, vi } from 'vitest';

import { QueryVersionsController } from '../query-versions.controller';
import { QueryVersionsModule } from '../query-versions.module';
import { QueryVersionsService } from '../query-versions.service';

const encryptionStub = { encrypt: vi.fn(), decrypt: vi.fn() };

@Global()
@Module({
  providers: [{ provide: EncryptionService, useValue: encryptionStub }],
  exports: [EncryptionService],
})
class StubEncryptionModule {}

describe('QueryVersionsModule', () => {
  it('compiles with all providers wired correctly', async () => {
    const module = await Test.createTestingModule({
      imports: [StubEncryptionModule, QueryVersionsModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: vi.fn() })
      .overrideProvider('SQL_CLIENT')
      .useValue({})
      .overrideProvider('DATABASE')
      .useValue({})
      .overrideProvider('CREATE_DATABASE_FROM_CLIENT')
      .useValue(() => ({}))
      .overrideProvider(RlsContextService)
      .useValue({ runWithUserContext: vi.fn() })
      .compile();

    expect(module.get(QueryVersionsController)).toBeInstanceOf(
      QueryVersionsController,
    );
    expect(module.get(QueryVersionsService)).toBeInstanceOf(
      QueryVersionsService,
    );
    expect(module.get('QUERY_VERSIONS_REPOSITORY')).toBeDefined();
    expect(module.get('SAVED_QUERIES_REPOSITORY')).toBeDefined();
    expect(module.get('QUERY_PUBLISH_EVENT_REPOSITORY')).toBeDefined();
  });
});
