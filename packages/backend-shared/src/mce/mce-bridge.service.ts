import { Inject, Injectable } from "@nestjs/common";
import axios, { AxiosRequestConfig } from "axios";

import { AppError, ErrorCode } from "../common/errors";
import { withRetry } from "./http-retry.util";
import { MCE_AUTH_PROVIDER, MceAuthProvider } from "./mce-auth.provider";
import { MceHttpClient } from "./mce-http-client";
import { parseSoapXml } from "./soap-xml.util";

@Injectable()
export class MceBridgeService {
  constructor(
    @Inject(MCE_AUTH_PROVIDER) private authProvider: MceAuthProvider,
    private readonly httpClient: MceHttpClient,
  ) {}

  /**
   * Constructs a SOAP Envelope for MCE
   */
  buildSoapEnvelope(token: string, body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
   <soap:Header>
      <fueloauth xmlns="http://exacttarget.com">${token}</fueloauth>
   </soap:Header>
   <soap:Body>
      ${body}
   </soap:Body>
</soap:Envelope>`;
  }

  /**
   * REST request with internal 401 retry (token refresh) and transient error resilience.
   * After retry fails, throws AppError with MCE_AUTH_EXPIRED.
   *
   * Retry behavior:
   * - 429/5xx errors → withRetry handles with exponential backoff
   * - 401 errors → internal auth refresh logic (not part of withRetry)
   *
   * @param timeout - Operation-specific timeout in milliseconds (defaults to MCE_TIMEOUTS.DEFAULT)
   */
  async request<T = unknown>(
    tenantId: string,
    userId: string,
    mid: string,
    config: AxiosRequestConfig,
    timeout?: number,
  ): Promise<T> {
    const makeRequest = async (forceRefresh: boolean): Promise<T> => {
      const { accessToken, tssd } = await this.authProvider.refreshToken(
        tenantId,
        userId,
        mid,
        forceRefresh,
      );
      const baseUrl = `https://${tssd}.rest.marketingcloudapis.com`;

      return this.httpClient.request<T>(
        {
          ...config,
          baseURL: config.baseURL ?? baseUrl,
          headers: {
            ...config.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        },
        timeout,
      );
    };

    return withRetry(async () => {
      try {
        return await makeRequest(false);
      } catch (error) {
        // MceHttpClient already translates errors to AppError
        // Check for auth expiry and retry once (not part of transient retry)
        if (
          error instanceof AppError &&
          error.code === ErrorCode.MCE_AUTH_EXPIRED
        ) {
          await this.authProvider.invalidateToken(tenantId, userId, mid);
          return await makeRequest(true);
        }
        throw error;
      }
    });
  }

  /**
   * Helper for SOAP requests with retry-on-auth-failure logic
   */
  async soapRequest<T = unknown>(
    tenantId: string,
    userId: string,
    mid: string,
    soapBody: string,
    soapAction: string,
  ): Promise<T> {
    const baseRequest = async (forceRefresh: boolean) => {
      const { accessToken, tssd } = await this.authProvider.refreshToken(
        tenantId,
        userId,
        mid,
        forceRefresh,
      );
      const envelope = this.buildSoapEnvelope(accessToken, soapBody);
      const baseUrl = `https://${tssd}.soap.marketingcloudapis.com`;

      const response = await axios.request({
        method: "POST",
        baseURL: baseUrl,
        url: "/Service.asmx",
        headers: {
          "Content-Type": "text/xml",
          SOAPAction: soapAction,
        },
        data: envelope,
      });

      const parsed =
        typeof response.data === "string"
          ? parseSoapXml(response.data)
          : (response.data as unknown);

      return { raw: response.data, parsed };
    };

    let first: { raw: unknown; parsed: unknown };
    try {
      first = await baseRequest(false);
    } catch (error) {
      this.handleError(error);
      throw error;
    }

    if (this.isSoapLoginFailedFault(first.raw, first.parsed)) {
      await this.authProvider.invalidateToken(tenantId, userId, mid);
      let second: { raw: unknown; parsed: unknown };
      try {
        second = await baseRequest(true);
      } catch (error) {
        this.handleError(error);
        throw error;
      }
      if (this.isSoapLoginFailedFault(second.raw, second.parsed)) {
        throw new AppError(ErrorCode.MCE_AUTH_EXPIRED);
      }
      return second.parsed as T;
    }

    return first.parsed as T;
  }

  private isSoapLoginFailedFault(raw: unknown, parsed: unknown): boolean {
    if (typeof raw === "string") {
      const hasFaultString =
        /<faultstring>\s*Login Failed\s*<\/faultstring>/i.test(raw);
      const hasSecurityFaultCode =
        /<faultcode[^>]*>[^<]*Security[^<]*<\/faultcode>/i.test(raw);
      if (hasFaultString && hasSecurityFaultCode) {
        return true;
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return false;
    }
    const record = parsed as Record<string, unknown>;
    const body = record.Body as Record<string, unknown> | undefined;
    const fault = body?.Fault as Record<string, unknown> | undefined;
    const faultcode = fault?.faultcode;
    const faultstring = fault?.faultstring;

    const code =
      typeof faultcode === "string"
        ? faultcode
        : Array.isArray(faultcode)
          ? String(faultcode[0] ?? "")
          : "";
    const message =
      typeof faultstring === "string"
        ? faultstring
        : Array.isArray(faultstring)
          ? String(faultstring[0] ?? "")
          : "";

    return /Security/i.test(code) && /Login Failed/i.test(message);
  }

  /**
   * Maps Axios errors to AppError with appropriate codes.
   * AppError from AuthService is passed through unchanged.
   */
  private handleError(error: unknown): never {
    // Pass through AppError (from AuthService or elsewhere)
    if (error instanceof AppError) {
      throw error;
    }

    if (axios.isAxiosError(error) && error.response) {
      const { status } = error.response;
      const code = this.mapStatusToErrorCode(status);
      throw new AppError(code, error);
    }

    // Non-Axios error or no response (network error)
    throw new AppError(ErrorCode.MCE_SERVER_ERROR, error);
  }

  private mapStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case 400:
        return ErrorCode.MCE_BAD_REQUEST;
      case 401:
        return ErrorCode.MCE_AUTH_EXPIRED; // Already retried internally
      case 403:
        return ErrorCode.MCE_FORBIDDEN;
      default:
        if (status >= 500) {
          return ErrorCode.MCE_SERVER_ERROR;
        }
        // Other 4xx - treat as bad request
        return ErrorCode.MCE_BAD_REQUEST;
    }
  }
}
