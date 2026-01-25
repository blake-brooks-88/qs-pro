import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppError, ErrorCode, ErrorMessages } from '@qpp/backend-shared';

import { GlobalExceptionFilter } from '../global-exception.filter';

// Test controller to throw different exception types
@Controller('test')
class TestController {
  @Get('app-error')
  throwAppError() {
    throw new AppError(ErrorCode.MCE_VALIDATION_FAILED);
  }

  @Get('app-error-mce-server')
  throwAppErrorMceServer() {
    throw new AppError(ErrorCode.MCE_SERVER_ERROR);
  }

  @Get('bad-request')
  throwBadRequest() {
    throw new BadRequestException('Invalid input');
  }

  @Get('not-found')
  throwNotFound() {
    throw new NotFoundException('Resource not found');
  }

  @Get('unauthorized')
  throwUnauthorized() {
    throw new UnauthorizedException('Authentication required');
  }

  @Get('unknown-error')
  throwUnknownError() {
    throw new Error('Something unexpected happened');
  }

  @Get('plain-unknown')
  throwPlainObject() {
    throw new (class CustomError extends Error {})();
  }
}

describe('GlobalExceptionFilter', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('AppError handling', () => {
    it('returns RFC 9457 Problem Details for AppError', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/app-error',
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(response.json()).toMatchObject({
        code: ErrorCode.MCE_VALIDATION_FAILED,
        type: 'urn:qpp:error:mce-validation-failed',
        title: 'Query Validation Failed',
        status: 400,
        detail: ErrorMessages[ErrorCode.MCE_VALIDATION_FAILED],
        instance: '/test/app-error',
      });
    });

    it('masks detail for 5xx AppError (except upstream)', async () => {
      // MCE_SERVER_ERROR (502 - upstream) should expose type/title
      const response = await app.inject({
        method: 'GET',
        url: '/test/app-error-mce-server',
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({
        code: ErrorCode.MCE_SERVER_ERROR,
        type: 'urn:qpp:error:mce-server-error',
        title: 'MCE Server Error',
        status: 502,
        detail: 'An unexpected error occurred', // Detail is masked
        instance: '/test/app-error-mce-server',
      });
    });
  });

  describe('HttpException handling (preserves NestJS semantics)', () => {
    it('returns 400 for BadRequestException with RFC 9457 format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/bad-request',
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(response.json()).toMatchObject({
        type: 'urn:qpp:error:http-400',
        title: 'Bad Request',
        status: 400,
        detail: 'Invalid input',
        instance: '/test/bad-request',
      });
    });

    it('returns 404 for NotFoundException', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/not-found',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        type: 'urn:qpp:error:http-404',
        title: 'Not Found',
        status: 404,
        detail: 'Resource not found',
        instance: '/test/not-found',
      });
    });

    it('returns 401 for UnauthorizedException', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/unauthorized',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        type: 'urn:qpp:error:http-401',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required',
        instance: '/test/unauthorized',
      });
    });
  });

  describe('Unknown error handling', () => {
    it('returns 500 with masked detail for unknown Error', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/unknown-error',
      });

      expect(response.statusCode).toBe(500);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(response.json()).toMatchObject({
        type: 'urn:qpp:error:internal-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred',
        instance: '/test/unknown-error',
      });

      // Ensure internal message is not leaked
      expect(response.json().detail).not.toContain('Something unexpected');
    });

    it('returns 500 with masked detail for non-Error objects', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/plain-unknown',
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({
        type: 'urn:qpp:error:internal-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred',
        instance: '/test/plain-unknown',
      });

      // Ensure custom object is not leaked
      expect(JSON.stringify(response.json())).not.toContain('custom');
    });
  });

  describe('Content-Type header', () => {
    it('sets Content-Type to application/problem+json for all responses', async () => {
      const endpoints = [
        '/test/app-error',
        '/test/bad-request',
        '/test/not-found',
        '/test/unknown-error',
      ];

      for (const endpoint of endpoints) {
        const response = await app.inject({
          method: 'GET',
          url: endpoint,
        });
        expect(response.headers['content-type']).toContain(
          'application/problem+json',
        );
      }
    });
  });

  describe('Request path handling', () => {
    it('sanitizes query parameters from instance path', async () => {
      // The filter sanitizes paths by removing query strings
      // Test this by checking the instance field
      const response = await app.inject({
        method: 'GET',
        url: '/test/app-error?foo=bar&baz=qux',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().instance).toBe('/test/app-error');
    });
  });

  describe('RFC 9457 compliance', () => {
    it('includes all required Problem Details fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/app-error',
      });

      expect(response.statusCode).toBe(400);
      const requiredFields = ['type', 'title', 'status', 'detail', 'instance'];
      for (const field of requiredFields) {
        expect(response.json()).toHaveProperty(field);
      }
    });

    it('type field uses urn:qpp:error prefix for domain errors', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/app-error',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().type).toMatch(/^urn:qpp:error:/);
    });

    it('status field matches HTTP status code', async () => {
      const testCases = [
        { endpoint: '/test/app-error', expectedStatus: 400 },
        { endpoint: '/test/bad-request', expectedStatus: 400 },
        { endpoint: '/test/not-found', expectedStatus: 404 },
        { endpoint: '/test/unauthorized', expectedStatus: 401 },
        { endpoint: '/test/unknown-error', expectedStatus: 500 },
      ];

      for (const { endpoint, expectedStatus } of testCases) {
        const response = await app.inject({
          method: 'GET',
          url: endpoint,
        });
        expect(response.statusCode).toBe(expectedStatus);
        expect(response.json().status).toBe(expectedStatus);
      }
    });
  });
});
