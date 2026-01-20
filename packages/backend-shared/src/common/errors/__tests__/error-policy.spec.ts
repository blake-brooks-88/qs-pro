import { describe, expect, it } from "vitest";

import {
  AppError,
  ErrorCode,
  getErrorTitle,
  getHttpStatus,
  isTerminal,
} from "../index";

describe("isTerminal", () => {
  describe("terminal errors (should NOT retry)", () => {
    it.each([
      ErrorCode.MCE_BAD_REQUEST,
      ErrorCode.MCE_AUTH_EXPIRED,
      ErrorCode.MCE_CREDENTIALS_MISSING,
      ErrorCode.MCE_TENANT_NOT_FOUND,
      ErrorCode.MCE_FORBIDDEN,
      ErrorCode.MCE_SOAP_FAILURE,
      ErrorCode.MCE_PAGINATION_EXCEEDED,
      ErrorCode.MCE_VALIDATION_FAILED,
      ErrorCode.SELECT_STAR_EXPANSION_FAILED,
      ErrorCode.SCHEMA_INFERENCE_FAILED,
      ErrorCode.SEAT_LIMIT_EXCEEDED,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      ErrorCode.CONFIG_ERROR,
    ])("returns true for %s", (code) => {
      const error = new AppError(code, "test");
      expect(isTerminal(error)).toBe(true);
    });
  });

  describe("non-terminal errors (SHOULD retry)", () => {
    it.each([
      ErrorCode.MCE_SERVER_ERROR,
      ErrorCode.DATABASE_ERROR,
      ErrorCode.REDIS_ERROR,
      ErrorCode.UNKNOWN,
    ])("returns false for %s", (code) => {
      const error = new AppError(code, "test");
      expect(isTerminal(error)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for non-AppError (unknown errors retry)", () => {
      expect(isTerminal(new Error("plain error"))).toBe(false);
      expect(isTerminal("string error")).toBe(false);
      expect(isTerminal(null)).toBe(false);
    });
  });
});

describe("getHttpStatus", () => {
  it.each([
    [ErrorCode.MCE_BAD_REQUEST, 400],
    [ErrorCode.MCE_AUTH_EXPIRED, 401],
    [ErrorCode.MCE_CREDENTIALS_MISSING, 401],
    [ErrorCode.MCE_TENANT_NOT_FOUND, 401],
    [ErrorCode.MCE_FORBIDDEN, 403],
    [ErrorCode.MCE_SERVER_ERROR, 502],
    [ErrorCode.MCE_VALIDATION_FAILED, 400],
    [ErrorCode.SELECT_STAR_EXPANSION_FAILED, 400],
    [ErrorCode.SCHEMA_INFERENCE_FAILED, 400],
    [ErrorCode.SEAT_LIMIT_EXCEEDED, 403],
    [ErrorCode.RATE_LIMIT_EXCEEDED, 429],
    [ErrorCode.CONFIG_ERROR, 500],
    [ErrorCode.DATABASE_ERROR, 500],
    [ErrorCode.UNKNOWN, 500],
  ])("maps %s to %i", (code, expectedStatus) => {
    expect(getHttpStatus(code)).toBe(expectedStatus);
  });
});

describe("getErrorTitle", () => {
  it("returns correct titles for all codes", () => {
    expect(getErrorTitle(ErrorCode.MCE_BAD_REQUEST)).toBe("MCE Bad Request");
    expect(getErrorTitle(ErrorCode.MCE_AUTH_EXPIRED)).toBe(
      "MCE Authentication Expired",
    );
    expect(getErrorTitle(ErrorCode.SEAT_LIMIT_EXCEEDED)).toBe(
      "Seat Limit Exceeded",
    );
    expect(getErrorTitle(ErrorCode.RATE_LIMIT_EXCEEDED)).toBe(
      "Rate Limit Exceeded",
    );
    expect(getErrorTitle(ErrorCode.CONFIG_ERROR)).toBe("Configuration Error");
  });
});
