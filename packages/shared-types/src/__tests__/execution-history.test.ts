import { describe, expect, it } from "vitest";

import {
  ExecutionHistoryItemSchema,
  HistoryListResponseSchema,
  HistoryQueryParamsSchema,
  RunSqlTextResponseSchema,
} from "../execution-history";

describe("ExecutionHistoryItemSchema", () => {
  const validItem = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    queryName: "My Query",
    sqlPreview: "SELECT * FROM ...",
    status: "ready",
    createdAt: "2026-01-15T10:30:00.000Z",
    startedAt: "2026-01-15T10:30:01.000Z",
    completedAt: "2026-01-15T10:30:05.000Z",
    durationMs: 4000,
    rowCount: 42,
    targetDeCustomerKey: "my-de-key",
    savedQueryId: "660e8400-e29b-41d4-a716-446655440000",
    errorMessage: null,
    hasSql: true,
  };

  it("should parse a valid item", () => {
    const result = ExecutionHistoryItemSchema.parse(validItem);
    expect(result.id).toBe(validItem.id);
    expect(result.status).toBe("ready");
    expect(result.hasSql).toBe(true);
  });

  it("should accept all valid status values", () => {
    const statuses = ["queued", "running", "ready", "failed", "canceled"];
    for (const status of statuses) {
      const result = ExecutionHistoryItemSchema.parse({ ...validItem, status });
      expect(result.status).toBe(status);
    }
  });

  it("should accept nullable fields as null", () => {
    const result = ExecutionHistoryItemSchema.parse({
      ...validItem,
      queryName: null,
      sqlPreview: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      rowCount: null,
      targetDeCustomerKey: null,
      savedQueryId: null,
      errorMessage: null,
    });
    expect(result.queryName).toBeNull();
    expect(result.durationMs).toBeNull();
  });

  it("should reject an invalid status", () => {
    expect(() =>
      ExecutionHistoryItemSchema.parse({ ...validItem, status: "unknown" }),
    ).toThrow();
  });

  it("should reject a non-uuid id", () => {
    expect(() =>
      ExecutionHistoryItemSchema.parse({ ...validItem, id: "not-a-uuid" }),
    ).toThrow();
  });
});

describe("RunSqlTextResponseSchema", () => {
  it("should parse a valid response", () => {
    const result = RunSqlTextResponseSchema.parse({ sql: "SELECT 1" });
    expect(result.sql).toBe("SELECT 1");
  });

  it("should reject missing sql field", () => {
    expect(() => RunSqlTextResponseSchema.parse({})).toThrow();
  });
});

describe("HistoryListResponseSchema", () => {
  it("should parse a valid paginated response", () => {
    const result = HistoryListResponseSchema.parse({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("HistoryQueryParamsSchema", () => {
  it("should apply default values", () => {
    const result = HistoryQueryParamsSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.sortBy).toBe("createdAt");
    expect(result.sortDir).toBe("desc");
  });

  it("should coerce string numbers", () => {
    const result = HistoryQueryParamsSchema.parse({
      page: "3",
      pageSize: "50",
    });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it("should reject pageSize above 100", () => {
    expect(() => HistoryQueryParamsSchema.parse({ pageSize: 200 })).toThrow();
  });

  it("should reject pageSize below 10", () => {
    expect(() => HistoryQueryParamsSchema.parse({ pageSize: 5 })).toThrow();
  });

  it("should reject invalid sortBy", () => {
    expect(() =>
      HistoryQueryParamsSchema.parse({ sortBy: "invalid" }),
    ).toThrow();
  });
});
