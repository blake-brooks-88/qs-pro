import { describe, expect, it } from "vitest";

import { AppError, ErrorCode, toAppError } from "../index";

describe("toAppError", () => {
  it("passes through existing AppError unchanged", () => {
    const original = new AppError(ErrorCode.MCE_VALIDATION_FAILED, "test");
    const result = toAppError(original);
    expect(result).toBe(original);
  });

  it("preserves original error as cause", () => {
    const original = new Error("original message");
    const result = toAppError(original);
    expect(result.cause).toBe(original);
    expect(result.message).toBe("original message");
  });

  it("wraps plain Error with UNKNOWN code", () => {
    const result = toAppError(new Error("something broke"));
    expect(result.code).toBe(ErrorCode.UNKNOWN);
    expect(result.message).toBe("something broke");
  });

  it("handles string errors gracefully", () => {
    const result = toAppError("string error");
    expect(result.code).toBe(ErrorCode.UNKNOWN);
    expect(result.message).toBe("Unknown error");
  });

  it("handles null/undefined gracefully", () => {
    expect(toAppError(null).code).toBe(ErrorCode.UNKNOWN);
    expect(toAppError(undefined).code).toBe(ErrorCode.UNKNOWN);
  });

  it("preserves cause chain in AppError", () => {
    const originalError = new Error("root cause");
    const result = toAppError(originalError);
    expect(result.cause).toBe(originalError);
  });
});
