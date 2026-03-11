import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BackofficeAuditService } from "../audit/audit.service.js";
import { DRIZZLE_DB } from "../database/database.module.js";
import { STRIPE_CLIENT } from "../stripe/stripe.provider.js";
import type { StripeCatalogService } from "../stripe/stripe-catalog.service.js";
import { TierManagementService } from "./tier-management.service.js";

function createMockStripe() {
  return {
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        id: "sub_existing",
        items: {
          data: [{ id: "si_item_1", price: { id: "price_old" } }],
        },
      }),
      update: vi.fn().mockResolvedValue({
        id: "sub_existing",
        status: "active",
      }),
      cancel: vi.fn().mockResolvedValue({
        id: "sub_existing",
        status: "canceled",
      }),
    },
  };
}

function createMockDb() {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };

  return {
    select: vi.fn().mockReturnValue(chain),
    insert: vi.fn().mockReturnValue(chain),
    update: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

function createMockAuditService(): BackofficeAuditService {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as BackofficeAuditService;
}

function createMockCatalogService(): StripeCatalogService {
  return {
    resolveCheckoutPriceId: vi.fn().mockResolvedValue("price_new_pro"),
  } as unknown as StripeCatalogService;
}

const MOCK_BINDING = {
  tenantId: "tenant-1",
  stripeCustomerId: "cus_123",
  stripeSubscriptionId: "sub_existing",
};

describe("TierManagementService", () => {
  let service: TierManagementService;
  let mockStripe: ReturnType<typeof createMockStripe>;
  let mockDb: ReturnType<typeof createMockDb>;
  let auditService: BackofficeAuditService;
  let catalogService: StripeCatalogService;

  beforeEach(async () => {
    mockStripe = createMockStripe();
    mockDb = createMockDb();
    auditService = createMockAuditService();
    catalogService = createMockCatalogService();

    mockDb._chain.limit.mockResolvedValue([MOCK_BINDING]);

    const module = await Test.createTestingModule({
      providers: [
        TierManagementService,
        { provide: DRIZZLE_DB, useValue: mockDb },
        { provide: STRIPE_CLIENT, useValue: mockStripe },
        { provide: "BackofficeAuditService", useValue: auditService },
        { provide: "StripeCatalogService", useValue: catalogService },
      ],
    }).compile();

    service = module.get(TierManagementService);
  });

  it("should retrieve current subscription and update to new tier price", async () => {
    await service.changeTier(
      "tenant-1",
      "pro",
      "monthly",
      "bo-user-1",
      "10.0.0.1",
    );

    expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith(
      "sub_existing",
    );
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
      "sub_existing",
      expect.objectContaining({
        items: [{ id: "si_item_1", price: "price_new_pro" }],
      }),
    );
  });

  it("should update orgSubscriptions.tier in database after Stripe update", async () => {
    await service.changeTier(
      "tenant-1",
      "pro",
      "monthly",
      "bo-user-1",
      "10.0.0.1",
    );

    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb._chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "pro" }),
    );
  });

  it("should audit log tier change with old and new tier", async () => {
    await service.changeTier(
      "tenant-1",
      "pro",
      "monthly",
      "bo-user-1",
      "10.0.0.1",
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "backoffice.tier_changed",
        backofficeUserId: "bo-user-1",
        targetTenantId: "tenant-1",
      }),
    );
  });

  it("should cancel subscription immediately via Stripe", async () => {
    await service.cancelSubscription("tenant-1", "bo-user-1", "10.0.0.1");

    expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith(
      "sub_existing",
    );
  });

  it("should update orgSubscriptions with canceled status", async () => {
    await service.cancelSubscription("tenant-1", "bo-user-1", "10.0.0.1");

    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb._chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionStatus: "canceled",
      }),
    );
  });

  it("should audit log subscription cancellation", async () => {
    await service.cancelSubscription("tenant-1", "bo-user-1", "10.0.0.1");

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "backoffice.subscription_canceled",
        backofficeUserId: "bo-user-1",
        targetTenantId: "tenant-1",
      }),
    );
  });

  it("should throw if no billing binding exists for tenant", async () => {
    mockDb._chain.limit.mockResolvedValueOnce([]);

    await expect(
      service.changeTier("tenant-1", "pro", "monthly", "bo-user-1", "10.0.0.1"),
    ).rejects.toThrow(NotFoundException);
  });
});
