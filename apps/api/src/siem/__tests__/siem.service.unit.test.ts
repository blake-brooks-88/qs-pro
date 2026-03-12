import type {
  ISiemWebhookConfigRepository,
  SiemWebhookConfig,
} from '@qpp/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SiemService } from '../siem.service';

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
    vi.clearAllMocks();
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
      ).rejects.toThrow('Invalid input. Please check your request.');
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

      await expect(service.testWebhook('tenant-1', '12345')).rejects.toThrow(
        'The requested resource was not found.',
      );
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
