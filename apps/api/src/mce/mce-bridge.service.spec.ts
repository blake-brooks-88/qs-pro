import { Test, TestingModule } from '@nestjs/testing';
import { MceBridgeService } from './mce-bridge.service';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { UnauthorizedException } from '@nestjs/common';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
            refreshToken: vi.fn().mockResolvedValue({
              accessToken: 'valid-token',
              tssd: 'test-tssd',
            }),
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('buildSoapEnvelope', () => {
    it('should construct a valid SOAP envelope with token', () => {
      const body = '<RetrieveRequest>...</RetrieveRequest>';
      const token = 'my-access-token';
      const envelope = service.buildSoapEnvelope(token, body, 'test-tssd');

      expect(envelope).toContain('<soap:Envelope');
      expect(envelope).toContain(token);
      expect(envelope).toContain(body);
      expect(envelope).toContain('http://schemas.xmlsoap.org/soap/envelope/');
    });
  });

  describe('request', () => {
    it('should make a request with refreshed token and correct base URL', async () => {
      vi.spyOn(axios, 'request').mockResolvedValue({ data: { success: true } } as any);

      const response = await service.request('tenant-1', 'user-1', 'mid-1', {
        method: 'GET',
        url: '/asset/v1/content/assets', // Relative URL
      });

      expect(authService.refreshToken).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'mid-1',
      );
      expect(axios.request).toHaveBeenCalledWith(
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
      vi.spyOn(axios, 'request').mockResolvedValue({ data: '<soap>response</soap>' } as any);

      const soapBody = '<RetrieveRequestMsg>...</RetrieveRequestMsg>';

      await service.soapRequest('tenant-1', 'user-1', 'mid-1', soapBody, 'Retrieve');

      expect(axios.request).toHaveBeenCalledWith(
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

    it('should normalize axios 401 error to ProblemDetails', async () => {
      const error = new AxiosError(
        'Unauthorized',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status: 401,
          statusText: 'Unauthorized',
          data: { message: 'Token expired' },
        } as any,
      );
      vi.spyOn(axios, 'request').mockRejectedValue(error);

      try {
        await service.request('tenant-1', 'user-1', 'mid-1', { url: '/test' });
        // Should fail
        expect(true).toBe(false);
      } catch (e: unknown) {
        const err = e as any; // Temporary bypass for complex exception object
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
        undefined,
        undefined,
        {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Something went wrong' },
        } as any,
      );
      vi.spyOn(axios, 'request').mockRejectedValue(error);

      try {
        await service.request('tenant-1', 'user-1', 'mid-1', { url: '/test' });
        expect(true).toBe(false);
      } catch (e: unknown) {
        const err = e as any;
        expect(err.getStatus()).toBe(500);
        const response = err.getResponse() as Record<string, unknown>;
        expect(response.title).toBe('Internal Server Error');
      }
    });
  });
});
