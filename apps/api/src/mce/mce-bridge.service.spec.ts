import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '@qpp/backend-shared';
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MceBridgeService } from './mce-bridge.service';

describe('MceBridgeService', () => {
  let service: MceBridgeService;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MceBridgeService,
        {
          provide: AuthService,
          useValue: {
            refreshToken: vi.fn(),
            invalidateToken: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MceBridgeService>(MceBridgeService);
    authService = module.get<AuthService>(AuthService);

    vi.mocked(authService.refreshToken).mockResolvedValue({
      accessToken: 'valid-token',
      tssd: 'test-tssd',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('buildSoapEnvelope', () => {
    it('should construct a valid SOAP envelope with token', () => {
      const body = '<RetrieveRequest>...</RetrieveRequest>';
      const token = 'my-access-token';
      const envelope = service.buildSoapEnvelope(token, body);

      expect(envelope).toContain('<soap:Envelope');
      expect(envelope).toContain(token);
      expect(envelope).toContain(body);
      expect(envelope).toContain('http://schemas.xmlsoap.org/soap/envelope/');
    });
  });

  describe('request', () => {
    it('should make a request with refreshed token and correct base URL', async () => {
      vi.spyOn(axios, 'request').mockResolvedValue({
        data: { success: true },
      });

      const response = await service.request('tenant-1', 'user-1', 'mid-1', {
        method: 'GET',
        url: '/asset/v1/content/assets', // Relative URL
      });

      expect(vi.mocked(authService.refreshToken)).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'mid-1',
      );
      expect(vi.mocked(axios.request)).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://test-tssd.rest.marketingcloudapis.com',
          url: '/asset/v1/content/assets',
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-token',
          }),
        }),
      );
      expect(response).toEqual({ success: true });
    });

    it('should handle SOAP requests using POST and specific content type', async () => {
      vi.spyOn(axios, 'request').mockResolvedValue({
        data: '<soap>response</soap>',
      });

      const soapBody = '<RetrieveRequestMsg>...</RetrieveRequestMsg>';

      await service.soapRequest(
        'tenant-1',
        'user-1',
        'mid-1',
        soapBody,
        'Retrieve',
      );

      expect(vi.mocked(axios.request)).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://test-tssd.soap.marketingcloudapis.com',
          url: '/Service.asmx',
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'text/xml',
            SOAPAction: 'Retrieve',
          }),
          data: expect.stringContaining('soap:Envelope'),
        }),
      );
    });

    it('should retry once when SOAP returns Login Failed security fault', async () => {
      const faultXml = `
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <soap:Fault>
              <faultcode xmlns:q0="...wssecurity...">q0:Security</faultcode>
              <faultstring>Login Failed</faultstring>
            </soap:Fault>
          </soap:Body>
        </soap:Envelope>
      `;

      vi.spyOn(axios, 'request')
        .mockResolvedValueOnce({ data: faultXml })
        .mockResolvedValueOnce({ data: '<soap>ok</soap>' });
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await service.soapRequest(
        'tenant-1',
        'user-1',
        'mid-1',
        '<RetrieveRequestMsg>...</RetrieveRequestMsg>',
        'Retrieve',
      );

      expect(vi.mocked(authService.invalidateToken)).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'mid-1',
      );
      expect(vi.mocked(authService.refreshToken)).toHaveBeenNthCalledWith(
        1,
        'tenant-1',
        'user-1',
        'mid-1',
        false,
      );
      expect(vi.mocked(authService.refreshToken)).toHaveBeenNthCalledWith(
        2,
        'tenant-1',
        'user-1',
        'mid-1',
        true,
      );
      expect(vi.mocked(axios.request)).toHaveBeenCalledTimes(2);
    });

    it('should normalize axios 401 error to ProblemDetails', async () => {
      const error = new AxiosError(
        'Unauthorized',
        'ERR_BAD_REQUEST',
        {} as InternalAxiosRequestConfig,
        null,
        {
          status: 401,
          statusText: 'Unauthorized',
          data: { message: 'Token expired' },
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        },
      );
      vi.spyOn(axios, 'request').mockRejectedValue(error);

      try {
        await service.request('tenant-1', 'user-1', 'mid-1', { url: '/test' });
        // Should fail
        expect(true).toBe(false);
      } catch (e: unknown) {
        const err = e as HttpException;
        expect(err.getStatus()).toBe(401);
        const response = err.getResponse() as Record<string, unknown>;
        expect(response.title).toBe('Unauthorized');
        expect(response.type).toBe('https://httpstatuses.com/401');
      }
    });

    it('should normalize axios 500 error to ProblemDetails', async () => {
      const error = new AxiosError(
        'Internal Server Error',
        'ERR_BAD_RESPONSE',
        {} as InternalAxiosRequestConfig,
        null,
        {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Something went wrong' },
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        },
      );
      vi.spyOn(axios, 'request').mockRejectedValue(error);

      try {
        await service.request('tenant-1', 'user-1', 'mid-1', { url: '/test' });
        expect(true).toBe(false);
      } catch (e: unknown) {
        const err = e as HttpException;
        expect(err.getStatus()).toBe(500);
        const response = err.getResponse() as Record<string, unknown>;
        expect(response.title).toBe('Internal Server Error');
      }
    });
  });
});
