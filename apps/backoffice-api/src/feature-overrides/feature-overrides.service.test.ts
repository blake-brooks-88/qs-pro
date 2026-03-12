import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BackofficeAuditService } from "../audit/audit.service.js";
import { DRIZZLE_DB } from "../database/database.module.js";
import { FeatureOverridesService } from "./feature-overrides.service.js";

function createMockDb() {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    target: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };

  const deleteChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };

  return {
    select: vi.fn().mockReturnValue(chain),
    insert: vi.fn().mockReturnValue(chain),
    delete: vi.fn().mockReturnValue(deleteChain),
    _chain: chain,
    _deleteChain: deleteChain,
  };
}

function createMockAuditService(): BackofficeAuditService {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as BackofficeAuditService;
}

describe("FeatureOverridesService", () => {
  let service: FeatureOverridesService;
  let mockDb: ReturnType<typeof createMockDb>;
  let auditService: BackofficeAuditService;

  beforeEach(async () => {
    mockDb = createMockDb();
    auditService = createMockAuditService();

    const module = await Test.createTestingModule({
      providers: [
        FeatureOverridesService,
        { provide: DRIZZLE_DB, useValue: mockDb },
        { provide: "BackofficeAuditService", useValue: auditService },
      ],
    }).compile();

    service = module.get(FeatureOverridesService);
  });

  it("should return all overrides for a tenant", async () => {
    const overrides = [
      { featureKey: "minimap", enabled: true },
      { featureKey: "auditLogs", enabled: false },
    ];
    mockDb._chain.where.mockResolvedValueOnce(overrides);

    const result = await service.getOverridesForTenant("tenant-1");

    expect(result).toEqual(overrides);
    expect(mockDb.select).toHaveBeenCalled();
  });

  it("should upsert override with ON CONFLICT", async () => {
    await service.setOverride(
      "tenant-1",
      "minimap",
      true,
      "bo-user-1",
      "10.0.0.1",
    );

    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb._chain.onConflictDoUpdate).toHaveBeenCalled();
  });

  it("should reject invalid feature keys", async () => {
    await expect(
      service.setOverride(
        "tenant-1",
        "invalidFeatureKey",
        true,
        "bo-user-1",
        "10.0.0.1",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("should accept valid feature keys from shared-types", async () => {
    await expect(
      service.setOverride(
        "tenant-1",
        "advancedAutocomplete",
        true,
        "bo-user-1",
        "10.0.0.1",
      ),
    ).resolves.not.toThrow();
  });

  it("should delete an override", async () => {
    await service.removeOverride(
      "tenant-1",
      "minimap",
      "bo-user-1",
      "10.0.0.1",
    );

    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockDb._deleteChain.where).toHaveBeenCalled();
  });

  it("should audit log override changes", async () => {
    await service.setOverride(
      "tenant-1",
      "minimap",
      true,
      "bo-user-1",
      "10.0.0.1",
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "backoffice.feature_override_changed",
        backofficeUserId: "bo-user-1",
        targetTenantId: "tenant-1",
      }),
    );
  });

  it("should audit log override removal", async () => {
    await service.removeOverride(
      "tenant-1",
      "minimap",
      "bo-user-1",
      "10.0.0.1",
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "backoffice.feature_override_removed",
        backofficeUserId: "bo-user-1",
        targetTenantId: "tenant-1",
      }),
    );
  });
});
