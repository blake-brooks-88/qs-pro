import { describe, expect, it } from "vitest";

import { ErrorCode, ErrorMessages } from "../index";

describe("ErrorCode", () => {
  it("has LINK_CONFLICT key", () => {
    expect(ErrorCode.LINK_CONFLICT).toBe("LINK_CONFLICT");
  });

  it("has FEATURE_NOT_ENABLED key", () => {
    expect(ErrorCode.FEATURE_NOT_ENABLED).toBe("FEATURE_NOT_ENABLED");
  });

  it("has all expected business logic codes", () => {
    const businessCodes = [
      "SEAT_LIMIT_EXCEEDED",
      "RATE_LIMIT_EXCEEDED",
      "QUOTA_EXCEEDED",
      "RESOURCE_NOT_FOUND",
      "INVALID_STATE",
      "LINK_CONFLICT",
      "VALIDATION_ERROR",
      "FEATURE_NOT_ENABLED",
    ] as const;

    for (const code of businessCodes) {
      expect(ErrorCode).toHaveProperty(code);
      expect(ErrorCode[code]).toBe(code);
    }
  });

  it("has authentication codes", () => {
    expect(ErrorCode.AUTH_UNAUTHORIZED).toBe("AUTH_UNAUTHORIZED");
    expect(ErrorCode.AUTH_IDENTITY_MISMATCH).toBe("AUTH_IDENTITY_MISMATCH");
  });

  it("has query activity error codes", () => {
    expect(ErrorCode.DUPLICATE_QUERY_ACTIVITY_NAME).toBe(
      "DUPLICATE_QUERY_ACTIVITY_NAME",
    );
    expect(ErrorCode.DUPLICATE_CUSTOMER_KEY).toBe("DUPLICATE_CUSTOMER_KEY");
    expect(ErrorCode.SHARED_DE_ACCESS_DENIED).toBe("SHARED_DE_ACCESS_DENIED");
  });
});

describe("ErrorMessages", () => {
  it("maps every ErrorCode value to a string", () => {
    const allCodes = Object.values(ErrorCode);
    for (const code of allCodes) {
      expect(typeof ErrorMessages[code as keyof typeof ErrorMessages]).toBe(
        "string",
      );
      expect(
        (ErrorMessages[code as keyof typeof ErrorMessages] as string).length,
      ).toBeGreaterThan(0);
    }
  });

  it("LINK_CONFLICT message mentions already linked", () => {
    expect(ErrorMessages[ErrorCode.LINK_CONFLICT]).toContain("already linked");
  });

  it("FEATURE_NOT_ENABLED message mentions subscription", () => {
    expect(ErrorMessages[ErrorCode.FEATURE_NOT_ENABLED]).toContain(
      "subscription",
    );
  });

  it("has no unmapped codes", () => {
    const codeValues = Object.values(ErrorCode);
    const messageKeys = Object.keys(ErrorMessages);
    expect(messageKeys).toHaveLength(codeValues.length);
  });
});
