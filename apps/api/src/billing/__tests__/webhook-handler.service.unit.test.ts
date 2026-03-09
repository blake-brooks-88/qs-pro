import { describe, expect, it } from 'vitest';

import { WebhookHandlerService } from '../webhook-handler.service';

function createService(): WebhookHandlerService {
  return new WebhookHandlerService(
    null,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('WebhookHandlerService', () => {
  describe('getInvoiceSubscriptionId', () => {
    it('prefers invoice.subscription when present', () => {
      const service = createService();

      const invoice = {
        subscription: 'sub_direct',
        lines: { data: [] },
      };

      expect(service['getInvoiceSubscriptionId'](invoice as never)).toBe(
        'sub_direct',
      );
    });

    it('falls back to invoice.subscription_details.subscription', () => {
      const service = createService();

      const invoice = {
        subscription: null,
        subscription_details: { subscription: 'sub_details' },
        lines: { data: [] },
      };

      expect(service['getInvoiceSubscriptionId'](invoice as never)).toBe(
        'sub_details',
      );
    });

    it('falls back to invoice.parent.subscription_details.subscription when parent is expanded', () => {
      const service = createService();

      const invoice = {
        subscription: null,
        parent: {
          subscription_details: { subscription: 'sub_parent_details' },
        },
        lines: { data: [] },
      };

      expect(service['getInvoiceSubscriptionId'](invoice as never)).toBe(
        'sub_parent_details',
      );
    });

    it('falls back to invoice parent subscription details (legacy path)', () => {
      const service = createService();

      const invoice = {
        subscription: null,
        parent: { subscription_details: { subscription: 'sub_legacy_parent' } },
        lines: { data: [] },
      };

      expect(service['getInvoiceSubscriptionId'](invoice as never)).toBe(
        'sub_legacy_parent',
      );
    });

    it('falls back to invoice line subscription when present', () => {
      const service = createService();

      const invoice = {
        subscription: null,
        lines: { data: [{ subscription: 'sub_line' }] },
      };

      expect(service['getInvoiceSubscriptionId'](invoice as never)).toBe(
        'sub_line',
      );
    });
  });
});
