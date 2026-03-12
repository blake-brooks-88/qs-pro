import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TenantsController } from "./tenants.controller.js";

describe("TenantsController", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns paginated tenants from service", async () => {
    const tenantsService = {
      findAll: vi.fn().mockResolvedValue({
        data: [],
        page: 2,
        limit: 10,
        total: 0,
      }),
      findById: vi.fn(),
      lookupByEid: vi.fn(),
    };
    const auditService = { log: vi.fn() };
    const tierManagement = { changeTier: vi.fn(), cancelSubscription: vi.fn() };

    const controller = new TenantsController(
      tenantsService as never,
      auditService as never,
      tierManagement as never,
    );

    const result = await controller.findAll({ page: 2, limit: 10 });
    expect(result).toEqual(
      expect.objectContaining({ page: 2, limit: 10, total: 0 }),
    );
    expect(tenantsService.findAll).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });

  it("throws NotFound when tenant lookup by id returns null", async () => {
    const tenantsService = { findById: vi.fn().mockResolvedValue(null) };
    const auditService = { log: vi.fn() };
    const tierManagement = { changeTier: vi.fn(), cancelSubscription: vi.fn() };

    const controller = new TenantsController(
      tenantsService as never,
      auditService as never,
      tierManagement as never,
    );

    await expect(controller.findById("missing")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("returns a tenant when tenant lookup by id succeeds", async () => {
    const tenantsService = {
      findById: vi.fn().mockResolvedValue({ id: "t-1" }),
    };
    const auditService = { log: vi.fn() };
    const tierManagement = { changeTier: vi.fn(), cancelSubscription: vi.fn() };

    const controller = new TenantsController(
      tenantsService as never,
      auditService as never,
      tierManagement as never,
    );

    await expect(controller.findById("t-1")).resolves.toEqual({ id: "t-1" });
  });

  it("logs and throws NotFound when EID lookup misses", async () => {
    const tenantsService = { lookupByEid: vi.fn().mockResolvedValue(null) };
    const auditService = { log: vi.fn() };
    const tierManagement = { changeTier: vi.fn(), cancelSubscription: vi.fn() };

    const controller = new TenantsController(
      tenantsService as never,
      auditService as never,
      tierManagement as never,
    );

    await expect(
      controller.lookupByEid("test---missing", { id: "bo-user-1" }, {
        ip: "127.0.0.1",
      } as unknown as FastifyRequest),
    ).rejects.toThrow(NotFoundException);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        backofficeUserId: "bo-user-1",
        eventType: "tenant.eid_lookup",
        ipAddress: "127.0.0.1",
      }),
    );
  });

  it("logs and returns tenant when EID lookup hits", async () => {
    const tenantsService = {
      lookupByEid: vi.fn().mockResolvedValue({ tenantId: "t-1" }),
    };
    const auditService = { log: vi.fn() };
    const tierManagement = { changeTier: vi.fn(), cancelSubscription: vi.fn() };

    const controller = new TenantsController(
      tenantsService as never,
      auditService as never,
      tierManagement as never,
    );

    await expect(
      controller.lookupByEid("test---eid", { id: "bo-user-1" }, {
        ip: "127.0.0.1",
      } as unknown as FastifyRequest),
    ).resolves.toEqual({ tenantId: "t-1" });
  });

  it("rejects tier changes to free via tier endpoint", async () => {
    const tenantsService = { findById: vi.fn() };
    const auditService = { log: vi.fn() };
    const tierManagement = { changeTier: vi.fn(), cancelSubscription: vi.fn() };

    const controller = new TenantsController(
      tenantsService as never,
      auditService as never,
      tierManagement as never,
    );

    await expect(
      controller.changeTier(
        "tenant-1",
        { tier: "free", interval: "monthly" },
        { id: "admin-1" },
        { ip: "127.0.0.1" } as unknown as FastifyRequest,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("changes tenant tier via TierManagementService", async () => {
    const tenantsService = { findById: vi.fn() };
    const auditService = { log: vi.fn() };
    const tierManagement = {
      changeTier: vi.fn().mockResolvedValue(undefined),
      cancelSubscription: vi.fn(),
    };

    const controller = new TenantsController(
      tenantsService as never,
      auditService as never,
      tierManagement as never,
    );

    const result = await controller.changeTier(
      "tenant-1",
      { tier: "pro", interval: "annual" },
      { id: "admin-1" },
      { ip: "127.0.0.1" } as unknown as FastifyRequest,
    );

    expect(result).toEqual({ success: true });
    expect(tierManagement.changeTier).toHaveBeenCalledWith(
      "tenant-1",
      "pro",
      "annual",
      "admin-1",
      "127.0.0.1",
    );
  });

  it("cancels tenant subscription via TierManagementService", async () => {
    const tenantsService = { findById: vi.fn() };
    const auditService = { log: vi.fn() };
    const tierManagement = {
      changeTier: vi.fn(),
      cancelSubscription: vi.fn().mockResolvedValue(undefined),
    };

    const controller = new TenantsController(
      tenantsService as never,
      auditService as never,
      tierManagement as never,
    );

    const result = await controller.cancelSubscription(
      "tenant-1",
      { id: "admin-1" },
      { ip: "127.0.0.1" } as unknown as FastifyRequest,
    );

    expect(result).toEqual({ success: true });
    expect(tierManagement.cancelSubscription).toHaveBeenCalledWith(
      "tenant-1",
      "admin-1",
      "127.0.0.1",
    );
  });
});
