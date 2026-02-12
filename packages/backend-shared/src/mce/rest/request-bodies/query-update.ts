import { AppError, ErrorCode } from "../../../common/errors";

export interface UpdateQueryTextRequest {
  method: "PATCH";
  url: string;
  data: { queryText: string };
}

export function buildUpdateQueryTextRequest(
  queryObjectId: string,
  queryText: string,
): UpdateQueryTextRequest {
  if (!queryObjectId || queryObjectId.trim() === "") {
    throw new AppError(ErrorCode.MCE_BAD_REQUEST, undefined, {
      field: "queryObjectId",
      reason: "must not be empty",
    });
  }

  if (!queryText || queryText.trim() === "") {
    throw new AppError(ErrorCode.MCE_BAD_REQUEST, undefined, {
      field: "queryText",
      reason: "must not be empty",
    });
  }

  const encodedId = encodeURIComponent(queryObjectId);
  return {
    method: "PATCH",
    url: `/automation/v1/queries/${encodedId}`,
    data: { queryText },
  };
}

export interface GetAutomationsRequest {
  method: "GET";
  url: string;
}

export function buildGetAutomationsRequest(
  page: number,
  pageSize: number,
): GetAutomationsRequest {
  if (page < 1) {
    throw new AppError(ErrorCode.MCE_BAD_REQUEST, undefined, {
      field: "page",
      reason: "must be >= 1",
    });
  }
  if (pageSize < 1) {
    throw new AppError(ErrorCode.MCE_BAD_REQUEST, undefined, {
      field: "pageSize",
      reason: "must be >= 1",
    });
  }

  return {
    method: "GET",
    // Community examples use both `page`/`pageSize` and `$page`/`$pageSize`.
    // Sending both makes pagination more resilient across tenants/versions.
    url: `/automation/v1/automations?page=${page}&pageSize=${pageSize}&$page=${page}&$pageSize=${pageSize}`,
  };
}

export interface GetAutomationDetailRequest {
  method: "GET";
  url: string;
}

export function buildGetAutomationDetailRequest(
  automationId: string,
): GetAutomationDetailRequest {
  if (!automationId || automationId.trim() === "") {
    throw new AppError(ErrorCode.MCE_BAD_REQUEST, undefined, {
      field: "automationId",
      reason: "must not be empty",
    });
  }

  const encodedId = encodeURIComponent(automationId);
  return {
    method: "GET",
    url: `/automation/v1/automations/${encodedId}`,
  };
}
