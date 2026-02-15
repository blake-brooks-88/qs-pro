import { describe, expect, it } from "vitest";

import { AuditLogQueryParamsSchema } from "../audit";

describe("AuditLogQueryParamsSchema", () => {
  it("should apply default values", () => {
    const result = AuditLogQueryParamsSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.sortBy).toBe("createdAt");
    expect(result.sortDir).toBe("desc");
  });

  it("should coerce string numbers", () => {
    const result = AuditLogQueryParamsSchema.parse({
      page: "2",
      pageSize: "50",
    });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
  });

  it("should accept pageSize of 1", () => {
    const result = AuditLogQueryParamsSchema.parse({ pageSize: 1 });
    expect(result.pageSize).toBe(1);
  });

  it("should accept small pageSize values", () => {
    const result = AuditLogQueryParamsSchema.parse({ pageSize: 5 });
    expect(result.pageSize).toBe(5);
  });

  it("should reject pageSize below 1", () => {
    expect(() => AuditLogQueryParamsSchema.parse({ pageSize: 0 })).toThrow();
  });

  it("should reject pageSize above 100", () => {
    expect(() => AuditLogQueryParamsSchema.parse({ pageSize: 200 })).toThrow();
  });

  it("should accept full ISO datetime for dateFrom/dateTo", () => {
    const result = AuditLogQueryParamsSchema.parse({
      dateFrom: "2026-02-14T00:00:00Z",
      dateTo: "2026-02-14T23:59:59Z",
    });
    expect(result.dateFrom).toBe("2026-02-14T00:00:00Z");
    expect(result.dateTo).toBe("2026-02-14T23:59:59Z");
  });

  it("should accept date-only strings for dateFrom/dateTo", () => {
    const result = AuditLogQueryParamsSchema.parse({
      dateFrom: "2026-02-14",
      dateTo: "2026-02-15",
    });
    expect(result.dateFrom).toBe("2026-02-14");
    expect(result.dateTo).toBe("2026-02-15");
  });

  it("should reject invalid date strings", () => {
    expect(() =>
      AuditLogQueryParamsSchema.parse({ dateFrom: "not-a-date" }),
    ).toThrow();
    expect(() =>
      AuditLogQueryParamsSchema.parse({ dateFrom: "02/14/2026" }),
    ).toThrow();
  });

  it("should accept valid eventType filter", () => {
    const result = AuditLogQueryParamsSchema.parse({
      eventType: "saved_query.created",
    });
    expect(result.eventType).toBe("saved_query.created");
  });

  it("should accept valid actorId (UUID)", () => {
    const result = AuditLogQueryParamsSchema.parse({
      actorId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.actorId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("should reject invalid sortBy", () => {
    expect(() =>
      AuditLogQueryParamsSchema.parse({ sortBy: "invalid" }),
    ).toThrow();
  });
});
