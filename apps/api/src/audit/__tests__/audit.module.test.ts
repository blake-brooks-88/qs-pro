import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EncryptionService, RlsContextService } from '@qpp/backend-shared';
import { describe, expect, it, vi } from 'vitest';

import { AuditController } from '../audit.controller';
import { AuditModule } from '../audit.module';
import { AuditService } from '../audit.service';

const encryptionStub = { encrypt: vi.fn(), decrypt: vi.fn() };

@Global()
@Module({
  providers: [{ provide: EncryptionService, useValue: encryptionStub }],
  exports: [EncryptionService],
})
class StubEncryptionModule {}

describe('AuditModule', () => {
  it('compiles with all providers wired correctly', async () => {
    const module = await Test.createTestingModule({
      imports: [StubEncryptionModule, AuditModule],
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
      .useValue({ runWithTenantContext: vi.fn() })
      .overrideProvider('USER_REPOSITORY')
      .useValue({})
      .compile();

    expect(module.get(AuditController)).toBeInstanceOf(AuditController);
    expect(module.get(AuditService)).toBeInstanceOf(AuditService);
    expect(module.get('AUDIT_LOG_REPOSITORY')).toBeDefined();
  });
});
