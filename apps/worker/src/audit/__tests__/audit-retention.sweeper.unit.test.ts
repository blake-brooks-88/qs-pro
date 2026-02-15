import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditRetentionSweeper } from "../audit-retention.sweeper";

vi.mock("@qpp/database", () => ({
  sql: Object.assign(
    (..._args: unknown[]) => "TAGGED_SQL",
    { raw: (str: string) => `RAW:${str}` },
  ),
  tenants: { auditRetentionDays: "audit_retention_days_col" },
}));

function createDbMock() {
  return { execute: vi.fn().mockResolvedValue([]) };
}

type DbMock = ReturnType<typeof createDbMock>;

function createSweeper(db: DbMock): AuditRetentionSweeper {
  return new AuditRetentionSweeper(db as never);
}

describe("AuditRetentionSweeper", () => {
  let dbMock: DbMock;
  let sweeper: AuditRetentionSweeper;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    dbMock = createDbMock();
    sweeper = createSweeper(dbMock);
  });

  describe("onModuleInit", () => {
    it("calls handlePartitionCreation on startup", async () => {
      // Arrange
      const spy = vi.spyOn(sweeper, "handlePartitionCreation").mockResolvedValue();

      // Act
      await sweeper.onModuleInit();

      // Assert
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  describe("handleRetentionPurge", () => {
    it("queries max retention from tenants table", async () => {
      // Arrange
      dbMock.execute
        .mockResolvedValueOnce([{ max_retention: 365 }])
        .mockResolvedValueOnce([]);

      // Act
      await sweeper.handleRetentionPurge();

      // Assert
      expect(dbMock.execute).toHaveBeenCalledTimes(2);
    });

    it("drops partitions older than the cutoff date", async () => {
      // Arrange — 90-day retention, current date Feb 14 2026
      // cutoff = Nov 16, 2025 → oldestAllowedYear=2025, oldestAllowedMonth=11
      // partition y2025m10 (Oct 2025) is expired: same year, month 10 < 11
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-14T12:00:00Z"));

      dbMock.execute
        .mockResolvedValueOnce([{ max_retention: 90 }])
        .mockResolvedValueOnce([
          { relname: "audit_logs_y2025m10" },
          { relname: "audit_logs_y2026m01" },
        ])
        .mockResolvedValue([]);

      // Act
      await sweeper.handleRetentionPurge();

      // Assert — 2 base queries + DETACH + DROP for the one expired partition
      expect(dbMock.execute).toHaveBeenCalledTimes(4);

      const detachCall = dbMock.execute.mock.calls[2]?.[0] as string;
      expect(detachCall).toContain("DETACH PARTITION");
      expect(detachCall).toContain("audit_logs_y2025m10");

      const dropCall = dbMock.execute.mock.calls[3]?.[0] as string;
      expect(dropCall).toContain("DROP TABLE");
      expect(dropCall).toContain("audit_logs_y2025m10");

      vi.useRealTimers();
    });

    it("skips partitions that do not match the naming regex", async () => {
      // Arrange
      dbMock.execute
        .mockResolvedValueOnce([{ max_retention: 30 }])
        .mockResolvedValueOnce([
          { relname: "audit_logs_other" },
          { relname: "audit_logs_backup_2024" },
        ]);

      // Act
      await sweeper.handleRetentionPurge();

      // Assert — only the 2 base queries, no DETACH/DROP
      expect(dbMock.execute).toHaveBeenCalledTimes(2);
    });

    it("does not drop partitions within the retention window", async () => {
      // Arrange — 365-day retention from Feb 14, 2026
      // cutoff = Feb 14, 2025 → oldestAllowedYear=2025, oldestAllowedMonth=2
      // partition y2025m02 (Feb 2025): same year, month 2 is NOT < 2 → not expired
      // partition y2025m06 (Jun 2025): same year, month 6 is NOT < 2 → not expired
      // partition y2026m01 (Jan 2026): year 2026 > 2025 → not expired
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-14T12:00:00Z"));

      dbMock.execute
        .mockResolvedValueOnce([{ max_retention: 365 }])
        .mockResolvedValueOnce([
          { relname: "audit_logs_y2025m02" },
          { relname: "audit_logs_y2025m06" },
          { relname: "audit_logs_y2026m01" },
        ]);

      // Act
      await sweeper.handleRetentionPurge();

      // Assert — only the 2 base queries, nothing dropped
      expect(dbMock.execute).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("logs error and continues when a single partition drop fails", async () => {
      // Arrange — two expired partitions, first DETACH fails
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-14T12:00:00Z"));

      dbMock.execute
        .mockResolvedValueOnce([{ max_retention: 365 }])
        .mockResolvedValueOnce([
          { relname: "audit_logs_y2024m11" },
          { relname: "audit_logs_y2024m12" },
        ])
        .mockRejectedValueOnce(new Error("lock timeout"))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const errorSpy = vi.spyOn(Logger.prototype, "error");
      const logSpy = vi.spyOn(Logger.prototype, "log");

      // Act
      await sweeper.handleRetentionPurge();

      // Assert — first partition fails (DETACH throws), second succeeds (DETACH + DROP)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to drop partition audit_logs_y2024m11"),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("lock timeout"),
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Dropped expired partition: audit_logs_y2024m12"),
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Dropped 1 partition(s)"),
      );

      vi.useRealTimers();
    });

    it("defaults to 365 days when max_retention is null", async () => {
      // Arrange — null/undefined retention, Feb 14, 2026
      // cutoff = Feb 14, 2025 → oldestAllowedYear=2025, oldestAllowedMonth=2
      // partition y2025m01 (Jan 2025): 2025 === 2025 && 1 < 2 → expired
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-14T12:00:00Z"));

      dbMock.execute
        .mockResolvedValueOnce([{ max_retention: null }])
        .mockResolvedValueOnce([
          { relname: "audit_logs_y2025m01" },
          { relname: "audit_logs_y2025m02" },
        ])
        .mockResolvedValue([]);

      // Act
      await sweeper.handleRetentionPurge();

      // Assert — only y2025m01 should be dropped (DETACH + DROP)
      expect(dbMock.execute).toHaveBeenCalledTimes(4);

      const detachCall = dbMock.execute.mock.calls[2]?.[0] as string;
      expect(detachCall).toContain("audit_logs_y2025m01");

      vi.useRealTimers();
    });

    it("logs top-level error when the retention query itself fails", async () => {
      // Arrange
      dbMock.execute.mockRejectedValueOnce(new Error("connection refused"));

      const errorSpy = vi.spyOn(Logger.prototype, "error");

      // Act
      await sweeper.handleRetentionPurge();

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Audit retention purge failed: connection refused"),
      );
    });
  });

  describe("handlePartitionCreation", () => {
    it("creates partitions for the current month and next 2 months", async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-14T12:00:00Z"));

      // Act
      await sweeper.handlePartitionCreation();

      // Assert — 3 CREATE TABLE calls
      expect(dbMock.execute).toHaveBeenCalledTimes(3);

      const calls = dbMock.execute.mock.calls.map((c) => c[0] as string);

      expect(calls[0]).toContain("audit_logs_y2026m02");
      expect(calls[0]).toContain("IF NOT EXISTS");
      expect(calls[0]).toContain("2026-02-01");
      expect(calls[0]).toContain("2026-03-01");

      expect(calls[1]).toContain("audit_logs_y2026m03");
      expect(calls[1]).toContain("2026-03-01");
      expect(calls[1]).toContain("2026-04-01");

      expect(calls[2]).toContain("audit_logs_y2026m04");
      expect(calls[2]).toContain("2026-04-01");
      expect(calls[2]).toContain("2026-05-01");

      vi.useRealTimers();
    });

    it("handles year boundary correctly when starting from December", async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));

      // Act
      await sweeper.handlePartitionCreation();

      // Assert
      expect(dbMock.execute).toHaveBeenCalledTimes(3);

      const calls = dbMock.execute.mock.calls.map((c) => c[0] as string);

      expect(calls[0]).toContain("audit_logs_y2026m12");
      expect(calls[0]).toContain("2026-12-01");
      expect(calls[0]).toContain("2027-01-01");

      expect(calls[1]).toContain("audit_logs_y2027m01");
      expect(calls[1]).toContain("2027-01-01");
      expect(calls[1]).toContain("2027-02-01");

      expect(calls[2]).toContain("audit_logs_y2027m02");
      expect(calls[2]).toContain("2027-02-01");
      expect(calls[2]).toContain("2027-03-01");

      vi.useRealTimers();
    });

    it("uses CREATE TABLE IF NOT EXISTS in the SQL", async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));

      // Act
      await sweeper.handlePartitionCreation();

      // Assert
      for (const call of dbMock.execute.mock.calls) {
        expect(call[0] as string).toContain("CREATE TABLE IF NOT EXISTS");
      }

      vi.useRealTimers();
    });

    it("logs error and continues when a single partition creation fails", async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-14T12:00:00Z"));

      dbMock.execute
        .mockRejectedValueOnce(new Error("already exists"))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const errorSpy = vi.spyOn(Logger.prototype, "error");
      const logSpy = vi.spyOn(Logger.prototype, "log");

      // Act
      await sweeper.handlePartitionCreation();

      // Assert — first partition fails, remaining two succeed
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to create partition audit_logs_y2026m02"),
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Pre-created partition: audit_logs_y2026m03"),
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Audit partition pre-creation completed."),
      );

      vi.useRealTimers();
    });
  });

  describe("getNextMonths (private)", () => {
    it("returns correct month ranges for Feb 2026", () => {
      // Arrange
      const from = new Date("2026-02-14T12:00:00Z");

      // Act
      const result = (sweeper as unknown as { getNextMonths: (from: Date, count: number) => Array<{ name: string; start: string; end: string }> }).getNextMonths(from, 3);

      // Assert
      expect(result).toEqual([
        { name: "audit_logs_y2026m02", start: "2026-02-01", end: "2026-03-01" },
        { name: "audit_logs_y2026m03", start: "2026-03-01", end: "2026-04-01" },
        { name: "audit_logs_y2026m04", start: "2026-04-01", end: "2026-05-01" },
      ]);
    });

    it("handles year boundary: Nov 2026 produces Nov, Dec, Jan 2027", () => {
      // Arrange
      const from = new Date("2026-11-01T12:00:00Z");

      // Act
      const result = (sweeper as unknown as { getNextMonths: (from: Date, count: number) => Array<{ name: string; start: string; end: string }> }).getNextMonths(from, 3);

      // Assert
      expect(result).toEqual([
        { name: "audit_logs_y2026m11", start: "2026-11-01", end: "2026-12-01" },
        { name: "audit_logs_y2026m12", start: "2026-12-01", end: "2027-01-01" },
        { name: "audit_logs_y2027m01", start: "2027-01-01", end: "2027-02-01" },
      ]);
    });

    it("zero-pads single-digit months correctly", () => {
      // Arrange
      const from = new Date("2026-01-15T12:00:00Z");

      // Act
      const result = (sweeper as unknown as { getNextMonths: (from: Date, count: number) => Array<{ name: string; start: string; end: string }> }).getNextMonths(from, 1);

      // Assert
      expect(result).toEqual([
        { name: "audit_logs_y2026m01", start: "2026-01-01", end: "2026-02-01" },
      ]);
    });
  });
});
