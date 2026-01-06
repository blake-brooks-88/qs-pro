import { Injectable, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import { AuthService } from '../auth/auth.service';
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
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  /**
   * Constructs a SOAP Envelope for MCE
   */
  buildSoapEnvelope(token: string, body: string, tssd: string): string {
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
      const { accessToken, tssd } = await this.authService.refreshToken(
        tenantId,
        userId,
        mid,
      );
      const envelope = this.buildSoapEnvelope(accessToken, soapBody, tssd);

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

      return typeof response.data === 'string'
        ? parseSoapXml(response.data)
        : response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
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
        status: status,
        detail:
          typeof data === 'string'
            ? data
            : data?.message || JSON.stringify(data),
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
