import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BackofficeAuditService } from '../audit/audit.service.js';
import type { StripeCatalogService } from '../stripe/stripe-catalog.service.js';

import { InvoicingService } from './invoicing.service.js';

vi.mock('@qpp/database', async () => {
  const actual = await vi.importActual('@qpp/database');
  return {
    ...actual,
    encrypt: vi.fn((_text: string, _key: string) => 'encrypted_eid_value'),
  };
});

function createMockStripe() {
  return {
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_new_123' }),
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    subscriptions: {
      create: vi.fn().mockResolvedValue({
        id: 'sub_abc123',
        status: 'active',
      }),
    },
    invoices: {
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'inv_001',
            hosted_invoice_url: 'https://stripe.com/invoice/001',
            status: 'open',
            amount_due: 9900,
            due_date: 1700000000,
            created: 1699900000,
            customer: 'cus_new_123',
            customer_name: 'Acme Corp',
          },
        ],
        has_more: false,
      }),
    },
  };
}

const MOCK_TENANT = {
  id: 'tenant-uuid-1',
  eid: 'test-eid-123',
  tssd: 'test-tssd',
  auditRetentionDays: 365,
  installedAt: new Date(),
};

function createMockDb() {
  const mockChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([MOCK_TENANT]),
    innerJoin: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };

  return {
    select: vi.fn().mockReturnValue(mockChain),
    insert: vi.fn().mockReturnValue(mockChain),
    _chain: mockChain,
  };
}

function createMockAuditService(): BackofficeAuditService {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as BackofficeAuditService;
}

function createMockCatalogService(): StripeCatalogService {
  return {
    resolveCheckoutPriceId: vi
      .fn()
      .mockResolvedValue('price_enterprise_monthly'),
  } as unknown as StripeCatalogService;
}

const BASE_PARAMS = {
  tenantEid: 'test-eid-123',
  tier: 'enterprise' as const,
  interval: 'monthly' as const,
  seatCount: 10,
  paymentTerms: 'net_30' as const,
  customerEmail: 'billing@acme.com',
  customerName: 'Jane Doe',
  companyName: 'Acme Corp',
};

describe('InvoicingService', () => {
  let service: InvoicingService;
  let mockStripe: ReturnType<typeof createMockStripe>;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockAudit: BackofficeAuditService;
  let mockCatalog: StripeCatalogService;

  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_KEY', '0'.repeat(64));
    mockStripe = createMockStripe();
    mockDb = createMockDb();
    mockAudit = createMockAuditService();
    mockCatalog = createMockCatalogService();

    service = new InvoicingService(
      mockStripe as never,
      mockDb as never,
      mockAudit,
      mockCatalog,
    );
  });

  describe('createInvoicedSubscription', () => {
    it('should create a new Stripe customer when no billing binding exists', async () => {
      mockDb._chain.limit
        .mockResolvedValueOnce([MOCK_TENANT])
        .mockResolvedValueOnce([]);

      await service.createInvoicedSubscription(
        BASE_PARAMS,
        'bo-user-1',
        '127.0.0.1',
      );

      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'billing@acme.com',
        name: 'Jane Doe',
        metadata: {
          company: 'Acme Corp',
          eid: 'encrypted_eid_value',
        },
      });
    });

    it('should reuse existing Stripe customer when billing binding exists', async () => {
      mockDb._chain.limit
        .mockResolvedValueOnce([MOCK_TENANT])
        .mockResolvedValueOnce([
          { stripeCustomerId: 'cus_existing_456', tenantId: 'tenant-uuid-1' },
        ]);

      await service.createInvoicedSubscription(
        BASE_PARAMS,
        'bo-user-1',
        '127.0.0.1',
      );

      expect(mockStripe.customers.create).not.toHaveBeenCalled();
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing_456',
        }),
      );
    });

    it('should create subscription with collection_method: send_invoice', async () => {
      mockDb._chain.limit
        .mockResolvedValueOnce([MOCK_TENANT])
        .mockResolvedValueOnce([]);

      await service.createInvoicedSubscription(
        BASE_PARAMS,
        'bo-user-1',
        '127.0.0.1',
      );

      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          collection_method: 'send_invoice',
          days_until_due: 30,
        }),
      );
    });

    it('should encrypt EID before embedding in Stripe metadata', async () => {
      const { encrypt: mockEncrypt } = await import('@qpp/database');

      mockDb._chain.limit
        .mockResolvedValueOnce([MOCK_TENANT])
        .mockResolvedValueOnce([]);

      await service.createInvoicedSubscription(
        BASE_PARAMS,
        'bo-user-1',
        '127.0.0.1',
      );

      expect(mockEncrypt).toHaveBeenCalledWith(
        'test-eid-123',
        '0'.repeat(64),
      );
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            eid: 'encrypted_eid_value',
          }),
        }),
      );
    });

    it('should return null invoiceUrl when hosted_invoice_url is not available', async () => {
      mockDb._chain.limit
        .mockResolvedValueOnce([MOCK_TENANT])
        .mockResolvedValueOnce([]);

      mockStripe.invoices.list.mockResolvedValueOnce({
        data: [
          {
            id: 'inv_002',
            status: 'open',
            amount_due: 9900,
            due_date: 1700000000,
          },
        ],
        has_more: false,
      });

      const result = await service.createInvoicedSubscription(
        BASE_PARAMS,
        'bo-user-1',
        '127.0.0.1',
      );

      expect(result.invoiceUrl).toBeNull();
    });

    it('should return invoiceUrl when available', async () => {
      mockDb._chain.limit
        .mockResolvedValueOnce([MOCK_TENANT])
        .mockResolvedValueOnce([]);

      const result = await service.createInvoicedSubscription(
        BASE_PARAMS,
        'bo-user-1',
        '127.0.0.1',
      );

      expect(result.invoiceUrl).toBe('https://stripe.com/invoice/001');
    });

    it('should upsert billing binding after subscription creation', async () => {
      mockDb._chain.limit
        .mockResolvedValueOnce([MOCK_TENANT])
        .mockResolvedValueOnce([]);

      await service.createInvoicedSubscription(
        BASE_PARAMS,
        'bo-user-1',
        '127.0.0.1',
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb._chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-uuid-1',
          stripeCustomerId: 'cus_new_123',
          stripeSubscriptionId: 'sub_abc123',
        }),
      );
    });

    it('should audit log the subscription creation', async () => {
      mockDb._chain.limit
        .mockResolvedValueOnce([MOCK_TENANT])
        .mockResolvedValueOnce([]);

      await service.createInvoicedSubscription(
        BASE_PARAMS,
        'bo-user-1',
        '127.0.0.1',
      );

      expect(mockAudit.log).toHaveBeenCalledWith({
        backofficeUserId: 'bo-user-1',
        targetTenantId: 'tenant-uuid-1',
        eventType: 'backoffice.subscription_created',
        metadata: expect.objectContaining({
          tier: 'enterprise',
          interval: 'monthly',
          seatCount: 10,
          paymentTerms: 'net_30',
          customerEmail: 'billing@acme.com',
          subscriptionId: 'sub_abc123',
        }),
        ipAddress: '127.0.0.1',
      });
    });

    it('should apply coupon discount when couponId provided', async () => {
      mockDb._chain.limit
        .mockResolvedValueOnce([MOCK_TENANT])
        .mockResolvedValueOnce([]);

      await service.createInvoicedSubscription(
        { ...BASE_PARAMS, couponId: 'coupon_xyz' },
        'bo-user-1',
        '127.0.0.1',
      );

      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discounts: [{ coupon: 'coupon_xyz' }],
        }),
      );
    });

    it('should not include discounts when couponId is absent', async () => {
      mockDb._chain.limit
        .mockResolvedValueOnce([MOCK_TENANT])
        .mockResolvedValueOnce([]);

      await service.createInvoicedSubscription(
        BASE_PARAMS,
        'bo-user-1',
        '127.0.0.1',
      );

      const callArgs = mockStripe.subscriptions.create.mock.calls[0]![0];
      expect(callArgs).not.toHaveProperty('discounts');
    });

    it('should include stripeInvoiceId in the result', async () => {
      mockDb._chain.limit
        .mockResolvedValueOnce([MOCK_TENANT])
        .mockResolvedValueOnce([]);

      const result = await service.createInvoicedSubscription(
        BASE_PARAMS,
        'bo-user-1',
        '127.0.0.1',
      );

      expect(result.stripeInvoiceId).toBe('inv_001');
    });

    it('should throw NotFoundException when tenant does not exist', async () => {
      mockDb._chain.limit.mockResolvedValueOnce([]);

      await expect(
        service.createInvoicedSubscription(
          BASE_PARAMS,
          'bo-user-1',
          '127.0.0.1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listInvoicesForTenant', () => {
    it('should return empty array when no binding exists', async () => {
      mockDb._chain.limit.mockResolvedValueOnce([]);

      const result = await service.listInvoicesForTenant('tenant-uuid-1');

      expect(result).toEqual([]);
    });

    it('should return mapped invoices when binding exists', async () => {
      mockDb._chain.limit.mockResolvedValueOnce([
        { stripeCustomerId: 'cus_existing_456', tenantId: 'tenant-uuid-1' },
      ]);

      mockStripe.invoices.list.mockResolvedValueOnce({
        data: [
          {
            id: 'inv_010',
            amount_due: 5000,
            status: 'paid',
            hosted_invoice_url: 'https://stripe.com/inv/010',
            due_date: 1700000000,
            created: 1699900000,
            customer: 'cus_existing_456',
            customer_name: 'Acme Corp',
          },
        ],
        has_more: false,
      });

      const result = await service.listInvoicesForTenant('tenant-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          amount: 5000,
          status: 'paid',
          hostedUrl: 'https://stripe.com/inv/010',
        }),
      );
    });
  });
});
