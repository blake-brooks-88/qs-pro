import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@qpp/backend-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qpp/backend-shared')>();
  return {
    ...actual,
    assertPublicHostname: vi.fn().mockResolvedValue(undefined),
  };
});

import { assertPublicHostname, ErrorCode } from '@qpp/backend-shared';
import type {
  ISiemWebhookConfigRepository,
  SiemWebhookConfig,
} from '@qpp/database';
import axios from 'axios';

import { SiemService } from '../siem.service';

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));

const mockAssertPublicHostname = vi.mocked(assertPublicHostname);

const mockSiemRepo: ISiemWebhookConfigRepository = {
  findByTenantId: vi.fn(),
  upsert: vi.fn(),
  updateStatus: vi.fn(),
  incrementFailures: vi.fn(),
  resetFailures: vi.fn(),
  disable: vi.fn(),
};

const mockRlsContext = {
  runWithTenantContext: vi.fn((_t: string, _m: string, fn: () => unknown) =>
    fn(),
  ),
  runWithUserContext: vi.fn(),
};

const mockEncryptionService = {
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
};

function buildConfig(
  overrides: Partial<SiemWebhookConfig> = {},
): SiemWebhookConfig {
  return {
    id: 'cfg-1',
    tenantId: 'tenant-1',
    mid: '12345',
    webhookUrl: 'https://siem.example.com/hook',
    secretEncrypted: 'enc:my-secret',
    enabled: true,
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    disabledAt: null,
    disabledReason: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('SiemService', () => {
  let service: SiemService;

  beforeEach(() => {
    vi.resetAllMocks();
    mockAssertPublicHostname.mockResolvedValue(undefined);
    service = new SiemService(
      mockSiemRepo,
      mockRlsContext as never,
      mockEncryptionService as never,
    );
  });

  describe('getConfig', () => {
    it('returns mapped response when config exists', async () => {
      const config = buildConfig();
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(config);

      const result = await service.getConfig('tenant-1', '12345');

      expect(result).toEqual({
        id: 'cfg-1',
        webhookUrl: 'https://siem.example.com/hook',
        enabled: true,
        consecutiveFailures: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        disabledAt: null,
        disabledReason: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('returns null when no config exists', async () => {
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(undefined);

      const result = await service.getConfig('tenant-1', '12345');

      expect(result).toBeNull();
    });
  });

  describe('upsertConfig', () => {
    it('encrypts secret and saves config', async () => {
      const config = buildConfig();
      vi.mocked(mockSiemRepo.upsert).mockResolvedValue(config);

      const result = await service.upsertConfig('tenant-1', '12345', {
        webhookUrl: 'https://siem.example.com/hook',
        secret: 'my-secret',
      });

      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('my-secret');
      expect(mockSiemRepo.upsert).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        mid: '12345',
        webhookUrl: 'https://siem.example.com/hook',
        secretEncrypted: 'enc:my-secret',
        enabled: true,
      });
      expect(result?.id).toBe('cfg-1');
    });

    it('rejects non-HTTPS URL', async () => {
      await expect(
        service.upsertConfig('tenant-1', '12345', {
          webhookUrl: 'http://insecure.example.com/hook',
          secret: 'my-secret',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    });

    it('rejects private/internal webhook hostname', async () => {
      await expect(
        service.upsertConfig('tenant-1', '12345', {
          webhookUrl: 'https://localhost/hook',
          secret: 'my-secret',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    });
  });

  describe('deleteConfig', () => {
    it('disables config when it exists', async () => {
      const config = buildConfig();
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(config);

      await service.deleteConfig('tenant-1', '12345');

      expect(mockSiemRepo.disable).toHaveBeenCalledWith(
        'tenant-1',
        'Deleted by admin',
      );
    });
  });

  describe('testWebhook', () => {
    it('throws when no config exists', async () => {
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(undefined);

      await expect(
        service.testWebhook('tenant-1', '12345'),
      ).rejects.toMatchObject({ code: ErrorCode.RESOURCE_NOT_FOUND });
    });

    it('returns success with status code for successful webhook test', async () => {
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(buildConfig());
      vi.mocked(axios.post).mockResolvedValue({ status: 200 });

      const result = await service.testWebhook('tenant-1', '12345');

      expect(result).toEqual({ success: true, statusCode: 200 });
    });

    it('returns failure when SSRF guard blocks the hostname', async () => {
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(buildConfig());
      mockAssertPublicHostname.mockRejectedValueOnce(
        new Error('SSRF blocked: test'),
      );

      const result = await service.testWebhook('tenant-1', '12345');

      expect(result).toEqual({ success: false, error: 'SSRF blocked: test' });
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('returns failure for non-2xx status', async () => {
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(buildConfig());
      vi.mocked(axios.post).mockResolvedValue({ status: 500 });

      const result = await service.testWebhook('tenant-1', '12345');

      expect(result).toEqual({ success: false, statusCode: 500 });
    });

    it('returns failure with error message on network error', async () => {
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(buildConfig());
      vi.mocked(axios.post).mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.testWebhook('tenant-1', '12345');

      expect(result).toEqual({ success: false, error: 'ECONNREFUSED' });
    });

    it('throws INTERNAL_ERROR when decryption fails', async () => {
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(buildConfig());
      mockEncryptionService.decrypt.mockReturnValueOnce(
        null as unknown as string,
      );

      await expect(
        service.testWebhook('tenant-1', '12345'),
      ).rejects.toMatchObject({ code: ErrorCode.INTERNAL_ERROR });
    });
  });

  describe('getConfigForDelivery', () => {
    it('returns URL and encrypted secret when config is enabled', async () => {
      const config = buildConfig();
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(config);

      const result = await service.getConfigForDelivery('tenant-1');

      expect(result).toEqual({
        webhookUrl: 'https://siem.example.com/hook',
        secretEncrypted: 'enc:my-secret',
      });
    });

    it('returns null when config is disabled', async () => {
      const config = buildConfig({ enabled: false });
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(config);

      const result = await service.getConfigForDelivery('tenant-1');

      expect(result).toBeNull();
    });

    it('returns null when no config exists', async () => {
      vi.mocked(mockSiemRepo.findByTenantId).mockResolvedValue(undefined);

      const result = await service.getConfigForDelivery('tenant-1');

      expect(result).toBeNull();
    });
  });
});
