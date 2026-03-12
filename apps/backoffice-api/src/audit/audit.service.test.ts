import { describe, expect, it, vi } from "vitest";

import { BackofficeAuditService } from "./audit.service.js";

describe("BackofficeAuditService", () => {
  it("log() does not throw when the insert fails", async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          execute: vi.fn().mockRejectedValue(new Error("db down")),
        })),
      })),
    } as unknown as { insert: unknown };

    const service = new BackofficeAuditService(db as never);

    await expect(
      service.log({
        backofficeUserId: "bo-user-1",
        eventType: "backoffice.test_event",
        metadata: { a: 1 },
        ipAddress: "127.0.0.1",
      }),
    ).resolves.toBeUndefined();
  });

  it("getLogsForTenant() uses default pagination (limit=50, offset=0)", async () => {
    const expected = [{ id: "log-1" }];

    const query = {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(expected),
    };

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => query),
      })),
    } as unknown as { select: unknown };

    const service = new BackofficeAuditService(db as never);
    const result = await service.getLogsForTenant("tenant-1");

    expect(result).toEqual(expected);
    expect(query.limit).toHaveBeenCalledWith(50);
    expect(query.offset).toHaveBeenCalledWith(0);
  });

  it("getAllLogs() applies eventType filter when provided", async () => {
    const expected = [{ id: "log-1" }];

    const baseQuery = {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(expected),
    };

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => baseQuery),
      })),
    } as unknown as { select: unknown };

    const service = new BackofficeAuditService(db as never);
    const result = await service.getAllLogs({ eventType: "foo.bar" });

    expect(result).toEqual(expected);
    expect(baseQuery.where).toHaveBeenCalledTimes(1);
  });
});
