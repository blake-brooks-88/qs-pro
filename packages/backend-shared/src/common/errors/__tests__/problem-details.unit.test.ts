import { describe, expect, it } from "vitest";

import {
  AppError,
  appErrorToProblemDetails,
  ErrorCode,
  ErrorMessages,
} from "../index";

describe("appErrorToProblemDetails", () => {
  it("produces RFC 9457 compliant structure for 4xx", () => {
    const error = new AppError(ErrorCode.SEAT_LIMIT_EXCEEDED);
    const result = appErrorToProblemDetails(error, "/api/users");

    expect(result).toEqual({
      type: "urn:qpp:error:seat-limit-exceeded",
      title: "Seat Limit Exceeded",
      status: 403,
      detail: ErrorMessages[ErrorCode.SEAT_LIMIT_EXCEEDED],
      instance: "/api/users",
    });
  });

  it("masks type, title, and detail for 5xx errors (security)", () => {
    const error = new AppError(ErrorCode.DATABASE_ERROR);
    const result = appErrorToProblemDetails(error, "/api/query");

    expect(result.status).toBe(500);
    expect(result.type).toBe("urn:qpp:error:internal-server-error");
    expect(result.title).toBe("Internal Server Error");
    expect(result.detail).toBe("An unexpected error occurred");
    expect(result.type).not.toContain("database");
  });

  it("converts error code to URN format (underscores to hyphens, lowercase)", () => {
    const error = new AppError(ErrorCode.SELECT_STAR_EXPANSION_FAILED);
    const result = appErrorToProblemDetails(error, "/test");
    expect(result.type).toBe("urn:qpp:error:select-star-expansion-failed");
  });

  it("returns correct HTTP status codes", () => {
    const tests = [
      [ErrorCode.MCE_BAD_REQUEST, 400],
      [ErrorCode.MCE_AUTH_EXPIRED, 401],
      [ErrorCode.MCE_FORBIDDEN, 403],
      [ErrorCode.RATE_LIMIT_EXCEEDED, 429],
      [ErrorCode.CONFIG_ERROR, 500],
    ];

    tests.forEach(([code, expectedStatus]) => {
      const error = new AppError(code as ErrorCode);
      const result = appErrorToProblemDetails(error, "/test");
      expect(result.status).toBe(expectedStatus);
    });
  });

  it("preserves request path in instance field", () => {
    const error = new AppError(ErrorCode.MCE_VALIDATION_FAILED);
    const result = appErrorToProblemDetails(error, "/api/shell-query/execute");
    expect(result.instance).toBe("/api/shell-query/execute");
  });

  it("keeps specific type and title for 4xx errors", () => {
    const tests = [
      [
        ErrorCode.MCE_BAD_REQUEST,
        "urn:qpp:error:mce-bad-request",
        "MCE Bad Request",
      ],
      [
        ErrorCode.MCE_AUTH_EXPIRED,
        "urn:qpp:error:mce-auth-expired",
        "MCE Authentication Expired",
      ],
      [
        ErrorCode.SEAT_LIMIT_EXCEEDED,
        "urn:qpp:error:seat-limit-exceeded",
        "Seat Limit Exceeded",
      ],
    ];

    tests.forEach(([code, expectedType, expectedTitle]) => {
      const error = new AppError(code as ErrorCode);
      const result = appErrorToProblemDetails(error, "/test");
      expect(result.type).toBe(expectedType);
      expect(result.title).toBe(expectedTitle);
      expect(result.detail).toBe(ErrorMessages[code as ErrorCode]);
    });
  });

  it("preserves type and title for upstream 5xx errors (MCE_SERVER_ERROR), but masks detail", () => {
    const error = new AppError(ErrorCode.MCE_SERVER_ERROR);
    const result = appErrorToProblemDetails(error, "/api/query");

    expect(result.status).toBe(502);
    expect(result.type).toBe("urn:qpp:error:mce-server-error");
    expect(result.title).toBe("MCE Server Error");
    expect(result.detail).toBe("An unexpected error occurred");
  });

  it("masks internal infrastructure 5xx errors (DATABASE_ERROR, REDIS_ERROR)", () => {
    const tests = [ErrorCode.DATABASE_ERROR, ErrorCode.REDIS_ERROR];

    tests.forEach((code) => {
      const error = new AppError(code);
      const result = appErrorToProblemDetails(error, "/test");

      expect(result.status).toBe(500);
      expect(result.type).toBe("urn:qpp:error:internal-server-error");
      expect(result.title).toBe("Internal Server Error");
      expect(result.detail).toBe("An unexpected error occurred");
      expect(result.type).not.toContain(code.toLowerCase());
    });
  });

  it("includes extensions in 4xx responses when provided", () => {
    const error = new AppError(
      ErrorCode.MCE_VALIDATION_FAILED,
      undefined,
      undefined,
      {
        violations: [
          "DELETE statement not allowed",
          "UPDATE statement not allowed",
        ],
        field: "query",
      },
    );
    const result = appErrorToProblemDetails(error, "/api/query");

    expect(result.status).toBe(400);
    expect(result.violations).toEqual([
      "DELETE statement not allowed",
      "UPDATE statement not allowed",
    ]);
    expect(result.field).toBe("query");
  });

  it("includes retryAfter extension for rate limit errors", () => {
    const error = new AppError(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      undefined,
      undefined,
      { retryAfter: 60 },
    );
    const result = appErrorToProblemDetails(error, "/api/query");

    expect(result.status).toBe(429);
    expect(result.retryAfter).toBe(60);
  });

  it("does NOT include extensions in 5xx responses", () => {
    const error = new AppError(ErrorCode.DATABASE_ERROR, undefined, undefined, {
      violations: ["should not appear"],
    });
    const result = appErrorToProblemDetails(error, "/api/query");

    expect(result.status).toBe(500);
    expect(result.violations).toBeUndefined();
  });
});
