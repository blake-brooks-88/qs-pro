import { Injectable } from "@nestjs/common";
import axios, { AxiosRequestConfig } from "axios";

import { AppError } from "../common/errors/app-error";
import { ErrorCode } from "../common/errors/error-codes";

const MAX_STATUS_MESSAGE_LENGTH = 500;

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength)}... [truncated]`;
}

function stripQueryString(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  const idx = url.indexOf("?");
  return idx === -1 ? url : url.slice(0, idx);
}

/**
 * Infrastructure layer HTTP client for MCE API calls.
 * Translates HTTP errors to AppError at the boundary.
 *
 * MceBridgeService passes fully-configured requests (including auth headers).
 * This class is responsible ONLY for HTTP execution and error translation.
 */
@Injectable()
export class MceHttpClient {
  async request<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response = await axios.request<T>(config);
      return response.data;
    } catch (error) {
      throw this.translateError(error);
    }
  }

  private translateError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (axios.isAxiosError(error) && error.response) {
      const { status, data } = error.response;
      const rawDetail =
        typeof data === "string"
          ? data
          : data?.message || `MCE request failed (${status})`;

      return new AppError(this.mapStatusToErrorCode(status), error, {
        status: String(status),
        operation: stripQueryString(error.config?.url),
        statusMessage: truncate(rawDetail, MAX_STATUS_MESSAGE_LENGTH),
      });
    }

    return new AppError(ErrorCode.MCE_SERVER_ERROR, error);
  }

  private mapStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case 400:
        return ErrorCode.MCE_BAD_REQUEST;
      case 401:
        return ErrorCode.MCE_AUTH_EXPIRED;
      case 403:
        return ErrorCode.MCE_FORBIDDEN;
      default:
        return status >= 500
          ? ErrorCode.MCE_SERVER_ERROR
          : ErrorCode.MCE_BAD_REQUEST;
    }
  }
}
