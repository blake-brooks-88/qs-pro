import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserSession } from '../../common/decorators/current-user.decorator';
import { SiemController, UpsertSiemConfigSchema } from '../siem.controller';
import type { SiemWebhookConfigResponse } from '../siem.types';

const mockSiemService = {
  getConfig: vi.fn(),
  upsertConfig: vi.fn(),
  deleteConfig: vi.fn(),
  testWebhook: vi.fn(),
};

const mockFeaturesService = {
  getTenantFeatures: vi.fn(),
};

const enterpriseFeatures = {
  tier: 'enterprise' as const,
  features: { auditLogs: true },
  trial: null,
  currentPeriodEnds: null,
};

const freeFeatures = {
  tier: 'free' as const,
  features: { auditLogs: false },
  trial: null,
  currentPeriodEnds: null,
};

const user: UserSession = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  mid: '12345',
};

const configResponse: SiemWebhookConfigResponse = {
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
};

describe('SiemController', () => {
  let controller: SiemController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new SiemController(
      mockSiemService as never,
      mockFeaturesService as never,
    );
  });

  describe('GET /admin/siem/config', () => {
    it('returns config for enterprise tenant', async () => {
      mockFeaturesService.getTenantFeatures.mockResolvedValue(
        enterpriseFeatures,
      );
      mockSiemService.getConfig.mockResolvedValue(configResponse);

      const result = await controller.getConfig(user);

      expect(result).toEqual(configResponse);
      expect(mockSiemService.getConfig).toHaveBeenCalledWith(
        'tenant-1',
        '12345',
      );
    });

    it('rejects non-enterprise tenant', async () => {
      mockFeaturesService.getTenantFeatures.mockResolvedValue(freeFeatures);

      await expect(controller.getConfig(user)).rejects.toThrow(
        'This feature is not enabled for your subscription.',
      );
    });
  });

  describe('PUT /admin/siem/config', () => {
    it('upserts config for enterprise tenant', async () => {
      mockFeaturesService.getTenantFeatures.mockResolvedValue(
        enterpriseFeatures,
      );
      mockSiemService.upsertConfig.mockResolvedValue(configResponse);

      const body = {
        webhookUrl: 'https://siem.example.com/hook',
        secret: 'my-long-secret-key',
      };
      const result = await controller.upsertConfig(user, body);

      expect(result).toEqual(configResponse);
      expect(mockSiemService.upsertConfig).toHaveBeenCalledWith(
        'tenant-1',
        '12345',
        body,
      );
    });
  });

  describe('DELETE /admin/siem/config', () => {
    it('deletes config for enterprise tenant', async () => {
      mockFeaturesService.getTenantFeatures.mockResolvedValue(
        enterpriseFeatures,
      );
      mockSiemService.deleteConfig.mockResolvedValue(undefined);

      await controller.deleteConfig(user);

      expect(mockSiemService.deleteConfig).toHaveBeenCalledWith(
        'tenant-1',
        '12345',
      );
    });
  });

  describe('POST /admin/siem/test', () => {
    it('returns test result for enterprise tenant', async () => {
      mockFeaturesService.getTenantFeatures.mockResolvedValue(
        enterpriseFeatures,
      );
      mockSiemService.testWebhook.mockResolvedValue({
        success: true,
        statusCode: 200,
      });

      const result = await controller.testWebhook(user);

      expect(result).toEqual({ success: true, statusCode: 200 });
    });

    it('rejects non-enterprise tenant', async () => {
      mockFeaturesService.getTenantFeatures.mockResolvedValue(freeFeatures);

      await expect(controller.testWebhook(user)).rejects.toThrow(
        'This feature is not enabled for your subscription.',
      );
    });
  });
});

describe('UpsertSiemConfigSchema', () => {
  it('rejects non-HTTPS webhook URLs', () => {
    const result = UpsertSiemConfigSchema.safeParse({
      webhookUrl: 'http://siem.example.com/webhook',
      secret: 'my-long-secret-key',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid HTTPS webhook URL', () => {
    const result = UpsertSiemConfigSchema.safeParse({
      webhookUrl: 'https://siem.example.com/hook',
      secret: 'my-long-secret-key',
    });

    expect(result.success).toBe(true);
  });
});
