import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosRequestConfig } from "axios";

import { AppError } from "../common/errors/app-error";
import { ErrorCode } from "../common/errors/error-codes";
import { MCE_TIMEOUTS } from "./http-timeout.config";
import { validateOutboundHost } from "./outbound-host-policy";

const MAX_STATUS_MESSAGE_LENGTH = 500;
const MAX_CONTENT_LENGTH = 50 * 1024 * 1024; // 50 MB

function tryParseUrlHostname(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

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
  private readonly logger = new Logger(MceHttpClient.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Execute HTTP request with timeout support.
   *
   * @param config - Axios request configuration
   * @param timeout - Request timeout in milliseconds (defaults to MCE_TIMEOUTS.DEFAULT)
   */
  async request<T>(
    config: AxiosRequestConfig,
    timeout: number = MCE_TIMEOUTS.DEFAULT,
  ): Promise<T> {
    const fullUrl = config.baseURL
      ? `${config.baseURL}${config.url ?? ""}`
      : config.url;

    if (fullUrl && /^https?:\/\//i.test(fullUrl)) {
      validateOutboundHost(
        fullUrl,
        this.getExtraHosts(),
        this.getPolicy(),
        this.logger,
      );
    }

    try {
      const response = await axios.request<T>({
        ...config,
        timeout,
        maxContentLength: MAX_CONTENT_LENGTH,
      });
      return response.data;
    } catch (error) {
      throw this.translateError(error);
    }
  }

  private getPolicy(): "log" | "block" {
    return (this.configService.get<string>("OUTBOUND_HOST_POLICY", "log") ??
      "log") as "log" | "block";
  }

  private getExtraHosts(): string[] {
    const hosts: string[] = [];
    const sentryDsn = this.configService.get<string>("SENTRY_DSN");
    if (sentryDsn) {
      const hostname = tryParseUrlHostname(sentryDsn);
      if (hostname) {
        hosts.push(hostname);
      }
    }
    const lokiHost = this.configService.get<string>("LOKI_HOST");
    if (lokiHost) {
      const hostname = tryParseUrlHostname(lokiHost);
      if (hostname) {
        hosts.push(hostname);
      }
    }
    return hosts;
  }

  private translateError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    // Handle timeout errors (ECONNABORTED from axios)
    if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
      return new AppError(ErrorCode.MCE_SERVER_ERROR, error, {
        operation: stripQueryString(error.config?.url),
        statusMessage: "Request timed out",
      });
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
      case 429:
        return ErrorCode.MCE_RATE_LIMITED;
      default:
        return status >= 500
          ? ErrorCode.MCE_SERVER_ERROR
          : ErrorCode.MCE_BAD_REQUEST;
    }
  }
}
