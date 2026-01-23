import { describe, expect, it } from "vitest";

import { AppError, ErrorCode, ErrorMessages, toAppError } from "../index";

describe("toAppError", () => {
  it("passes through existing AppError unchanged", () => {
    const original = new AppError(ErrorCode.MCE_VALIDATION_FAILED);
    const result = toAppError(original);
    expect(result).toBe(original);
  });

  it("wraps plain Error with UNKNOWN code", () => {
    const original = new Error("something broke");
    const result = toAppError(original);
    expect(result.code).toBe(ErrorCode.UNKNOWN);
    expect(result.message).toBe(ErrorMessages[ErrorCode.UNKNOWN]);
    expect(result.cause).toBe(original);
  });

  it("handles string errors gracefully", () => {
    const result = toAppError("string error");
    expect(result.code).toBe(ErrorCode.UNKNOWN);
    expect(result.message).toBe(ErrorMessages[ErrorCode.UNKNOWN]);
  });

  it("handles null/undefined gracefully", () => {
    expect(toAppError(null).code).toBe(ErrorCode.UNKNOWN);
    expect(toAppError(undefined).code).toBe(ErrorCode.UNKNOWN);
  });

  it("wraps arbitrary objects with UNKNOWN code", () => {
    const result = toAppError({ foo: "bar" });
    expect(result.code).toBe(ErrorCode.UNKNOWN);
    expect(result.message).toBe(ErrorMessages[ErrorCode.UNKNOWN]);
  });
});
