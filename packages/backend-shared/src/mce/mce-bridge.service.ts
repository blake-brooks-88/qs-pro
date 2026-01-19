import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import axios, { AxiosRequestConfig } from "axios";

import { MCE_AUTH_PROVIDER, MceAuthProvider } from "./mce-auth.provider";
import { parseSoapXml } from "./soap-xml.util";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: string | number | undefined;
}

@Injectable()
export class MceBridgeService {
  constructor(
    @Inject(MCE_AUTH_PROVIDER) private authProvider: MceAuthProvider,
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
   * Generic request wrapper handling token injection and error normalization
   */
  async request<T = unknown>(
    tenantId: string,
    userId: string,
    mid: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const { accessToken, tssd } = await this.authProvider.refreshToken(
        tenantId,
        userId,
        mid,
      );

      // Determine Base URL (REST by default)
      const baseUrl = `https://${tssd}.rest.marketingcloudapis.com`;

      const response = await axios.request<T>({
        ...config,
        baseURL: config.baseURL ?? baseUrl,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error; // handleRequest throws HttpException, but TypeScript needs this
    }
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
        throw new UnauthorizedException("MCE SOAP authentication failed");
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

  private handleError(error: unknown): void {
    if (error instanceof HttpException) {
      throw error;
    }

    if (axios.isAxiosError(error) && error.response) {
      const { status, statusText, data } = error.response;

      const problem: ProblemDetails = {
        type: `https://httpstatuses.com/${status}`,
        title: statusText || "An error occurred",
        status,
        detail:
          typeof data === "string"
            ? data
            : data?.message || JSON.stringify(data),
      };

      throw new HttpException(problem, status);
    }

    // Non-Axios error or no response
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Internal Server Error",
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: error instanceof Error ? error.message : "Unknown error",
    };

    throw new HttpException(problem, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
