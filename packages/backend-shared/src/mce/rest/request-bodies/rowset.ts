import { AppError, ErrorCode } from "../../../common/errors";

export interface RowsetRequestParams {
  dataExtensionName: string;
  page: number;
  pageSize: number;
}

export interface RowsetRequest {
  method: "GET";
  url: string;
}

export function buildRowsetRequest(params: RowsetRequestParams): RowsetRequest {
  const { dataExtensionName, page, pageSize } = params;

  if (!dataExtensionName || dataExtensionName.trim() === "") {
    throw new AppError(ErrorCode.MCE_BAD_REQUEST, undefined, {
      field: "dataExtensionName",
      reason: "must not be empty",
    });
  }
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

  const encodedName = encodeURIComponent(dataExtensionName);

  return {
    method: "GET",
    url: `/data/v1/customobjectdata/key/${encodedName}/rowset?$page=${page}&$pageSize=${pageSize}`,
  };
}
