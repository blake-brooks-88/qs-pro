import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserSession } from '../../common/decorators/current-user.decorator';
import { DevToolsController } from '../dev-tools.controller';
import type { DevToolsService } from '../dev-tools.service';

const mockUser: UserSession = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  mid: 'mid-1',
};

const mockFeatures = {
  tier: 'pro' as const,
  features: {
    basicLinting: true,
    syntaxHighlighting: true,
    quickFixes: true,
    minimap: true,
    advancedAutocomplete: true,
    teamSnippets: false,
    auditLogs: false,
  },
  trial: null,
};

function createDevToolsServiceStub(): {
  [K in keyof DevToolsService]: ReturnType<typeof vi.fn>;
} {
  return {
    setTrialDays: vi.fn().mockResolvedValue(mockFeatures),
    createCheckout: vi
      .fn()
      .mockResolvedValue({ url: 'https://checkout.stripe.com/session_123' }),
    cancelSubscription: vi.fn().mockResolvedValue({ canceled: true }),
    resetToFree: vi.fn().mockResolvedValue(mockFeatures),
  };
}

describe('DevToolsController', () => {
  let controller: DevToolsController;
  let serviceMock: ReturnType<typeof createDevToolsServiceStub>;

  beforeEach(() => {
    serviceMock = createDevToolsServiceStub();
    controller = new DevToolsController(
      serviceMock as unknown as DevToolsService,
    );
  });

  describe('setTrial', () => {
    it('delegates to devToolsService.setTrialDays with tenantId and days', async () => {
      const result = await controller.setTrial(mockUser, { days: 14 });

      expect(serviceMock.setTrialDays).toHaveBeenCalledWith('tenant-1', 14);
      expect(result).toEqual(mockFeatures);
    });
  });

  describe('createCheckout', () => {
    it('delegates to devToolsService.createCheckout with tenantId and tier', async () => {
      const result = await controller.createCheckout(mockUser, {
        tier: 'pro',
      });

      expect(serviceMock.createCheckout).toHaveBeenCalledWith(
        'tenant-1',
        'pro',
      );
      expect(result).toEqual({
        url: 'https://checkout.stripe.com/session_123',
      });
    });
  });

  describe('cancelSubscription', () => {
    it('delegates to devToolsService.cancelSubscription with tenantId', async () => {
      const result = await controller.cancelSubscription(mockUser);

      expect(serviceMock.cancelSubscription).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ canceled: true });
    });
  });

  describe('resetToFree', () => {
    it('delegates to devToolsService.resetToFree with tenantId', async () => {
      const result = await controller.resetToFree(mockUser);

      expect(serviceMock.resetToFree).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual(mockFeatures);
    });
  });
});
