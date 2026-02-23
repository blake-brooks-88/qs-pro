import { describe, expect, it, vi } from "vitest";

import { AppError, ErrorCode } from "../../common/errors";
import { SeatLimitService } from "../seat-limit.service";

function createTenantRepoMock() {
  return {
    findById: vi.fn(),
    countUsersByTenantId: vi.fn(),
  };
}

function createOrgSubscriptionRepoMock() {
  return {
    findByTenantId: vi.fn(),
  };
}

describe("SeatLimitService", () => {
  function createService() {
    const tenantRepo = createTenantRepoMock();
    const orgSubscriptionRepo = createOrgSubscriptionRepoMock();
    const service = new SeatLimitService(
      tenantRepo as never,
      orgSubscriptionRepo as never,
    );
    return { service, tenantRepo, orgSubscriptionRepo };
  }

  it("does nothing when tenant not found", async () => {
    const { service, tenantRepo } = createService();
    tenantRepo.findById.mockResolvedValue(undefined);

    await expect(
      service.checkSeatLimit("missing-tenant"),
    ).resolves.toBeUndefined();
    expect(tenantRepo.countUsersByTenantId).not.toHaveBeenCalled();
  });

  it("does nothing when no subscription exists", async () => {
    const { service, tenantRepo, orgSubscriptionRepo } = createService();
    tenantRepo.findById.mockResolvedValue({ id: "t-1" });
    orgSubscriptionRepo.findByTenantId.mockResolvedValue(undefined);

    await expect(service.checkSeatLimit("t-1")).resolves.toBeUndefined();
    expect(tenantRepo.countUsersByTenantId).not.toHaveBeenCalled();
  });

  it("does nothing when subscription has null seatLimit", async () => {
    const { service, tenantRepo, orgSubscriptionRepo } = createService();
    tenantRepo.findById.mockResolvedValue({ id: "t-1" });
    orgSubscriptionRepo.findByTenantId.mockResolvedValue({
      id: "sub-1",
      tenantId: "t-1",
      seatLimit: null,
    });

    await expect(service.checkSeatLimit("t-1")).resolves.toBeUndefined();
    expect(tenantRepo.countUsersByTenantId).not.toHaveBeenCalled();
  });

  it("does nothing when user count is below seat limit", async () => {
    const { service, tenantRepo, orgSubscriptionRepo } = createService();
    tenantRepo.findById.mockResolvedValue({ id: "t-1" });
    orgSubscriptionRepo.findByTenantId.mockResolvedValue({
      id: "sub-1",
      tenantId: "t-1",
      seatLimit: 10,
    });
    tenantRepo.countUsersByTenantId.mockResolvedValue(5);

    await expect(service.checkSeatLimit("t-1")).resolves.toBeUndefined();
  });

  it("throws SEAT_LIMIT_EXCEEDED when user count equals seat limit", async () => {
    const { service, tenantRepo, orgSubscriptionRepo } = createService();
    tenantRepo.findById.mockResolvedValue({ id: "t-1" });
    orgSubscriptionRepo.findByTenantId.mockResolvedValue({
      id: "sub-1",
      tenantId: "t-1",
      seatLimit: 10,
    });
    tenantRepo.countUsersByTenantId.mockResolvedValue(10);

    const error = await service.checkSeatLimit("t-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(ErrorCode.SEAT_LIMIT_EXCEEDED);
  });

  it("throws SEAT_LIMIT_EXCEEDED when user count exceeds seat limit", async () => {
    const { service, tenantRepo, orgSubscriptionRepo } = createService();
    tenantRepo.findById.mockResolvedValue({ id: "t-1" });
    orgSubscriptionRepo.findByTenantId.mockResolvedValue({
      id: "sub-1",
      tenantId: "t-1",
      seatLimit: 10,
    });
    tenantRepo.countUsersByTenantId.mockResolvedValue(15);

    const error = await service.checkSeatLimit("t-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(ErrorCode.SEAT_LIMIT_EXCEEDED);
  });
});
