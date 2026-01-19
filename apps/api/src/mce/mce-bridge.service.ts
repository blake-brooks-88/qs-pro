import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '@qs-pro/backend-shared';
import axios, { AxiosRequestConfig } from 'axios';

import { parseSoapXml } from './soap-xml.util';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: any;
}

@Injectable()
export class MceBridgeService {
  private readonly logger = new Logger(MceBridgeService.name);

  constructor(private authService: AuthService) {}

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
  async request<T = any>(
    tenantId: string,
    userId: string,
    mid: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const { accessToken, tssd } = await this.authService.refreshToken(
        tenantId,
        userId,
        mid,
      );

      // Determine Base URL (REST by default)
      const baseUrl = `https://${tssd}.rest.marketingcloudapis.com`;

      const response = await axios.request<T>({
        ...config,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Empty baseURL should use default
        baseURL: config.baseURL || baseUrl,
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
   * Helper for SOAP requests
   */
  async soapRequest(
    tenantId: string,
    userId: string,
    mid: string,
    soapBody: string,
    soapAction: string,
  ): Promise<any> {
    try {
      const baseRequest = async (forceRefresh: boolean) => {
        const { accessToken, tssd } = await this.authService.refreshToken(
          tenantId,
          userId,
          mid,
          forceRefresh,
        );
        const envelope = this.buildSoapEnvelope(accessToken, soapBody);
        const baseUrl = `https://${tssd}.soap.marketingcloudapis.com`;

        const response = await axios.request({
          method: 'POST',
          baseURL: baseUrl,
          url: '/Service.asmx',
          headers: {
            'Content-Type': 'text/xml',
            SOAPAction: soapAction,
          },
          data: envelope,
        });

        const parsed =
          typeof response.data === 'string'
            ? parseSoapXml(response.data)
            : (response.data as unknown);

        return { raw: response.data, parsed };
      };

      const first = await baseRequest(false);
      if (this.isSoapLoginFailedFault(first.raw, first.parsed)) {
        this.logger.warn(
          `SOAP auth fault detected (Login Failed). Invalidating token and retrying once. action=${soapAction} tenantId=${tenantId} userId=${userId} mid=${mid}`,
        );
        await this.authService.invalidateToken(tenantId, userId, mid);
        const second = await baseRequest(true);
        if (this.isSoapLoginFailedFault(second.raw, second.parsed)) {
          throw new UnauthorizedException('MCE SOAP authentication failed');
        }
        return second.parsed;
      }

      return first.parsed;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  private isSoapLoginFailedFault(raw: unknown, parsed: unknown): boolean {
    if (typeof raw === 'string') {
      const hasFaultString =
        /<faultstring>\s*Login Failed\s*<\/faultstring>/i.test(raw);
      const hasSecurityFaultCode =
        /<faultcode[^>]*>[^<]*Security[^<]*<\/faultcode>/i.test(raw);
      if (hasFaultString && hasSecurityFaultCode) {
        return true;
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return false;
    }
    const record = parsed as Record<string, unknown>;
    const body = record.Body as Record<string, unknown> | undefined;
    const fault = body?.Fault as Record<string, unknown> | undefined;
    const faultcode = fault?.faultcode;
    const faultstring = fault?.faultstring;

    const code =
      typeof faultcode === 'string'
        ? faultcode
        : Array.isArray(faultcode)
          ? String(faultcode[0] ?? '')
          : '';
    const message =
      typeof faultstring === 'string'
        ? faultstring
        : Array.isArray(faultstring)
          ? String(faultstring[0] ?? '')
          : '';

    return /Security/i.test(code) && /Login Failed/i.test(message);
  }

  private handleError(error: any): void {
    if (error instanceof HttpException) {
      throw error;
    }

    if (axios.isAxiosError(error) && error.response) {
      const { status, statusText, data } = error.response;

      const problem: ProblemDetails = {
        type: `https://httpstatuses.com/${status}`,
        title: statusText || 'An error occurred',
        status,
        detail:
          typeof data === 'string'
            ? data
            : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Empty message should show stringified data
              data?.message || JSON.stringify(data),
      };

      throw new HttpException(problem, status);
    }

    // Non-Axios error or no response
    const problem: ProblemDetails = {
      type: 'about:blank',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: error instanceof Error ? error.message : 'Unknown error',
    };

    throw new HttpException(problem, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
