import { describe, expect, it } from "vitest";

import { AppError, ErrorCode } from "../../../common/errors";
import {
  buildGetAutomationDetailRequest,
  buildGetAutomationsRequest,
  buildUpdateQueryTextRequest,
} from "./query-update";

function catchAppError(fn: () => unknown): AppError {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(AppError);
  return caught as AppError;
}

describe("buildUpdateQueryTextRequest", () => {
  it("returns correct method, URL, and data for valid inputs", () => {
    const result = buildUpdateQueryTextRequest("obj-123", "SELECT 1");

    expect(result.method).toBe("PATCH");
    expect(result.url).toBe("/automation/v1/queries/obj-123");
    expect(result.data).toEqual({ queryText: "SELECT 1" });
  });

  it("URL contains the encoded queryObjectId", () => {
    const result = buildUpdateQueryTextRequest("abc-def", "SELECT 1");

    expect(result.url).toContain(encodeURIComponent("abc-def"));
  });

  it("data.queryText matches the input queryText", () => {
    const sql = "SELECT Name FROM [My DE] WHERE Status = 'Active'";
    const result = buildUpdateQueryTextRequest("obj-1", sql);

    expect(result.data.queryText).toBe(sql);
  });

  it("encodes special characters in queryObjectId via encodeURIComponent", () => {
    const objectId = "id/with spaces&special=chars";
    const result = buildUpdateQueryTextRequest(objectId, "SELECT 1");

    expect(result.url).toBe(
      `/automation/v1/queries/${encodeURIComponent(objectId)}`,
    );
    expect(result.url).not.toContain(" ");
    expect(result.url).not.toContain("&special");
  });

  it("throws AppError (MCE_BAD_REQUEST) when queryObjectId is empty string", () => {
    const error = catchAppError(() =>
      buildUpdateQueryTextRequest("", "SELECT 1"),
    );

    expect(error.code).toBe(ErrorCode.MCE_BAD_REQUEST);
    expect(error.context?.field).toBe("queryObjectId");
  });

  it("throws AppError (MCE_BAD_REQUEST) when queryObjectId is whitespace-only", () => {
    const error = catchAppError(() =>
      buildUpdateQueryTextRequest("   ", "SELECT 1"),
    );

    expect(error.code).toBe(ErrorCode.MCE_BAD_REQUEST);
  });

  it("throws AppError (MCE_BAD_REQUEST) when queryText is empty string", () => {
    const error = catchAppError(() => buildUpdateQueryTextRequest("obj-1", ""));

    expect(error.code).toBe(ErrorCode.MCE_BAD_REQUEST);
    expect(error.context?.field).toBe("queryText");
  });

  it("throws AppError (MCE_BAD_REQUEST) when queryText is whitespace-only", () => {
    const error = catchAppError(() =>
      buildUpdateQueryTextRequest("obj-1", "   "),
    );

    expect(error.code).toBe(ErrorCode.MCE_BAD_REQUEST);
  });
});

describe("buildGetAutomationsRequest", () => {
  it("returns correct method and URL with page and pageSize query params", () => {
    const result = buildGetAutomationsRequest(1, 200);

    expect(result.method).toBe("GET");
    expect(result.url).toBe(
      "/automation/v1/automations?page=1&pageSize=200&$page=1&$pageSize=200",
    );
  });

  it("handles different page/pageSize values correctly", () => {
    const result = buildGetAutomationsRequest(3, 50);

    expect(result.method).toBe("GET");
    expect(result.url).toBe(
      "/automation/v1/automations?page=3&pageSize=50&$page=3&$pageSize=50",
    );
  });

  it("throws AppError (MCE_BAD_REQUEST) when page is less than 1", () => {
    const error = catchAppError(() => buildGetAutomationsRequest(0, 200));

    expect(error.code).toBe(ErrorCode.MCE_BAD_REQUEST);
    expect(error.context?.field).toBe("page");
  });

  it("throws AppError (MCE_BAD_REQUEST) when pageSize is less than 1", () => {
    const error = catchAppError(() => buildGetAutomationsRequest(1, 0));

    expect(error.code).toBe(ErrorCode.MCE_BAD_REQUEST);
    expect(error.context?.field).toBe("pageSize");
  });
});

describe("buildGetAutomationDetailRequest", () => {
  it("returns correct method and URL for valid automationId", () => {
    const result = buildGetAutomationDetailRequest("auto-123");

    expect(result.method).toBe("GET");
    expect(result.url).toBe("/automation/v1/automations/auto-123");
  });

  it("encodes special characters in automationId", () => {
    const automationId = "id/with spaces&special=chars";
    const result = buildGetAutomationDetailRequest(automationId);

    expect(result.url).toBe(
      `/automation/v1/automations/${encodeURIComponent(automationId)}`,
    );
    expect(result.url).not.toContain(" ");
    expect(result.url).not.toContain("&special");
  });

  it("throws AppError (MCE_BAD_REQUEST) when automationId is empty string", () => {
    const error = catchAppError(() => buildGetAutomationDetailRequest(""));

    expect(error.code).toBe(ErrorCode.MCE_BAD_REQUEST);
    expect(error.context?.field).toBe("automationId");
  });

  it("throws AppError (MCE_BAD_REQUEST) when automationId is whitespace-only", () => {
    const error = catchAppError(() => buildGetAutomationDetailRequest("   "));

    expect(error.code).toBe(ErrorCode.MCE_BAD_REQUEST);
    expect(error.context?.field).toBe("automationId");
  });
});
