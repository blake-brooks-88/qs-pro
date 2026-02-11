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
    url: `/automation/v1/automations?$page=${page}&$pagesize=${pageSize}`,
  };
}
