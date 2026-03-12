import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DRIZZLE_DB } from "../database/database.module.js";
import { BackofficeAuditService } from "./audit.service.js";

function createMockDb() {
  const chain = {
    values: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };
  return {
    insert: vi.fn().mockReturnValue(chain),
    select: vi.fn().mockReturnValue(selectChain),
    _insertChain: chain,
    _selectChain: selectChain,
  };
}

describe("BackofficeAuditService", () => {
  let service: BackofficeAuditService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module = await Test.createTestingModule({
      providers: [
        BackofficeAuditService,
        { provide: DRIZZLE_DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get(BackofficeAuditService);
  });

  it("should insert audit log with all fields", async () => {
    await service.log({
      backofficeUserId: "user-123",
      targetTenantId: "tenant-456",
      eventType: "tenant.tier_change",
      metadata: { from: "free", to: "pro" },
      ipAddress: "192.168.1.1",
    });

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const valuesCall = mockDb._insertChain.values.mock.calls[0]?.[0];
    expect(valuesCall).toMatchObject({
      backofficeUserId: "user-123",
      targetTenantId: "tenant-456",
      eventType: "tenant.tier_change",
      metadata: { from: "free", to: "pro" },
      ipAddress: "192.168.1.1",
    });
  });

  it("should insert audit log without optional fields", async () => {
    await service.log({
      backofficeUserId: "user-123",
      eventType: "system.login",
    });

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const valuesCall = mockDb._insertChain.values.mock.calls[0]?.[0];
    expect(valuesCall).toMatchObject({
      backofficeUserId: "user-123",
      eventType: "system.login",
    });
    expect(valuesCall.targetTenantId).toBeUndefined();
    expect(valuesCall.metadata).toBeUndefined();
    expect(valuesCall.ipAddress).toBeUndefined();
  });

  it("should not throw when insert fails", async () => {
    mockDb._insertChain.execute.mockRejectedValueOnce(
      new Error("DB connection lost"),
    );

    await expect(
      service.log({
        backofficeUserId: "user-123",
        eventType: "tenant.view",
      }),
    ).resolves.toBeUndefined();
  });

  it("should return logs for a tenant sorted by date descending", async () => {
    const sampleLogs = [
      {
        id: "1",
        backofficeUserId: "u1",
        eventType: "tenant.view",
        createdAt: new Date("2026-03-08"),
      },
      {
        id: "2",
        backofficeUserId: "u2",
        eventType: "tenant.edit",
        createdAt: new Date("2026-03-07"),
      },
    ];

    mockDb._selectChain.offset.mockResolvedValueOnce(sampleLogs);

    const result = await service.getLogsForTenant("tenant-456", {
      limit: 10,
      offset: 0,
    });

    expect(result).toEqual(sampleLogs);
    expect(mockDb.select).toHaveBeenCalled();
  });

  it("should respect limit and offset in getLogsForTenant", async () => {
    mockDb._selectChain.offset.mockResolvedValueOnce([]);

    await service.getLogsForTenant("tenant-456", { limit: 5, offset: 10 });

    expect(mockDb._selectChain.limit).toHaveBeenCalledWith(5);
    expect(mockDb._selectChain.offset).toHaveBeenCalledWith(10);
  });

  it("should return all logs with defaults when no options provided", async () => {
    mockDb._selectChain.offset.mockResolvedValueOnce([]);

    await service.getAllLogs();

    expect(mockDb._selectChain.limit).toHaveBeenCalledWith(50);
    expect(mockDb._selectChain.offset).toHaveBeenCalledWith(0);
  });

  it("should filter getAllLogs by eventType when provided", async () => {
    mockDb._selectChain.offset.mockResolvedValueOnce([]);

    await service.getAllLogs({
      eventType: "tenant.view",
      limit: 10,
      offset: 5,
    });

    expect(mockDb._selectChain.where).toHaveBeenCalledTimes(1);
    expect(mockDb._selectChain.limit).toHaveBeenCalledWith(10);
    expect(mockDb._selectChain.offset).toHaveBeenCalledWith(5);
  });
});
