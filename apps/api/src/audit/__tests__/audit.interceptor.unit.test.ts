import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUDIT_EVENT_KEY } from '../../common/decorators/audited.decorator';
import { AuditInterceptor } from '../audit.interceptor';
import type { AuditService } from '../audit.service';

function createMockReflector(
  returnValue: unknown = undefined,
): Reflector & { get: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn().mockReturnValue(returnValue),
  } as unknown as Reflector & { get: ReturnType<typeof vi.fn> };
}

function createMockAuditService(): AuditService & {
  log: ReturnType<typeof vi.fn>;
} {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService & { log: ReturnType<typeof vi.fn> };
}

function createMockExecutionContext(request: Record<string, unknown> = {}) {
  const handler = vi.fn();

  const context = {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, handler };
}

function createMockCallHandler<T = unknown>(returnValue: T): CallHandler {
  return {
    handle: vi.fn().mockReturnValue(of(returnValue)),
  };
}

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let reflector: ReturnType<typeof createMockReflector>;
  let auditService: ReturnType<typeof createMockAuditService>;

  beforeEach(() => {
    reflector = createMockReflector();
    auditService = createMockAuditService();
    interceptor = new AuditInterceptor(reflector, auditService);
  });

  describe('when handler has no @Audited metadata', () => {
    it('passes through without calling auditService.log', async () => {
      // Arrange
      reflector.get.mockReturnValue(undefined);
      const { context } = createMockExecutionContext();
      const next = createMockCallHandler({ ok: true });

      // Act
      const result$ = interceptor.intercept(context, next);
      const result = await lastValueFrom(result$);

      // Assert
      expect(reflector.get).toHaveBeenCalledWith(
        AUDIT_EVENT_KEY,
        context.getHandler(),
      );
      expect(result).toEqual({ ok: true });
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('when user context is missing', () => {
    it('passes through when request.user is undefined', async () => {
      // Arrange
      reflector.get.mockReturnValue({ eventType: 'query.created' });
      const { context } = createMockExecutionContext({ user: undefined });
      const next = createMockCallHandler({ ok: true });

      // Act
      const result$ = interceptor.intercept(context, next);
      const result = await lastValueFrom(result$);

      // Assert
      expect(result).toEqual({ ok: true });
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('passes through when user has no tenantId', async () => {
      // Arrange
      reflector.get.mockReturnValue({ eventType: 'query.created' });
      const { context } = createMockExecutionContext({
        user: { userId: 'user-1', tenantId: undefined, mid: 'mid-1' },
      });
      const next = createMockCallHandler({ ok: true });

      // Act
      const result$ = interceptor.intercept(context, next);
      const result = await lastValueFrom(result$);

      // Assert
      expect(result).toEqual({ ok: true });
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('passes through when user has no mid', async () => {
      // Arrange
      reflector.get.mockReturnValue({ eventType: 'query.created' });
      const { context } = createMockExecutionContext({
        user: { userId: 'user-1', tenantId: 'tenant-1', mid: undefined },
      });
      const next = createMockCallHandler({ ok: true });

      // Act
      const result$ = interceptor.intercept(context, next);
      const result = await lastValueFrom(result$);

      // Assert
      expect(result).toEqual({ ok: true });
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('when audit metadata and user context are present', () => {
    const defaultUser = {
      userId: 'user-42',
      tenantId: 'tenant-1',
      mid: 'mid-100',
    };

    it('calls auditService.log with correct fields after successful handler execution', async () => {
      // Arrange
      reflector.get.mockReturnValue({ eventType: 'query.created' });
      const { context } = createMockExecutionContext({
        user: defaultUser,
        ip: '192.168.1.1',
        headers: { 'user-agent': 'TestAgent/1.0' },
        params: {},
      });
      const responseData = { id: 'resp-id-1', name: 'test' };
      const next = createMockCallHandler(responseData);

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledOnce();
      expect(auditService.log).toHaveBeenCalledWith({
        eventType: 'query.created',
        actorType: 'user',
        actorId: 'user-42',
        tenantId: 'tenant-1',
        mid: 'mid-100',
        targetId: 'resp-id-1',
        metadata: undefined,
        ipAddress: '192.168.1.1',
        userAgent: 'TestAgent/1.0',
      });
    });

    it('sets actorId to null when userId is undefined', async () => {
      // Arrange
      reflector.get.mockReturnValue({ eventType: 'query.deleted' });
      const { context } = createMockExecutionContext({
        user: { userId: undefined, tenantId: 'tenant-1', mid: 'mid-1' },
        ip: '10.0.0.1',
        headers: {},
        params: {},
      });
      const next = createMockCallHandler({});

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledOnce();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: null,
        }),
      );
    });
  });

  describe('targetId extraction', () => {
    const defaultUser = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      mid: 'mid-1',
    };

    it('extracts targetId from request.params when targetIdParam is specified', async () => {
      // Arrange
      reflector.get.mockReturnValue({
        eventType: 'query.updated',
        targetIdParam: 'queryId',
      });
      const { context } = createMockExecutionContext({
        user: defaultUser,
        ip: '127.0.0.1',
        headers: {},
        params: { queryId: 'q-abc-123' },
      });
      const next = createMockCallHandler({ id: 'should-not-use-this' });

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: 'q-abc-123',
        }),
      );
    });

    it('falls back to responseData.id when targetIdParam is not specified', async () => {
      // Arrange
      reflector.get.mockReturnValue({ eventType: 'query.created' });
      const { context } = createMockExecutionContext({
        user: defaultUser,
        ip: '127.0.0.1',
        headers: {},
        params: {},
      });
      const next = createMockCallHandler({ id: 'new-resource-id' });

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: 'new-resource-id',
        }),
      );
    });

    it('falls back to responseData.id when targetIdParam is specified but param is missing', async () => {
      // Arrange
      reflector.get.mockReturnValue({
        eventType: 'query.updated',
        targetIdParam: 'queryId',
      });
      const { context } = createMockExecutionContext({
        user: defaultUser,
        ip: '127.0.0.1',
        headers: {},
        params: {},
      });
      const next = createMockCallHandler({ id: 'fallback-id' });

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: 'fallback-id',
        }),
      );
    });

    it('returns null targetId when neither param nor responseData.id is available', async () => {
      // Arrange
      reflector.get.mockReturnValue({ eventType: 'settings.updated' });
      const { context } = createMockExecutionContext({
        user: defaultUser,
        ip: '127.0.0.1',
        headers: {},
        params: {},
      });
      const next = createMockCallHandler({ name: 'no-id-here' });

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: null,
        }),
      );
    });

    it('returns null targetId when responseData.id is not a string', async () => {
      // Arrange
      reflector.get.mockReturnValue({ eventType: 'settings.updated' });
      const { context } = createMockExecutionContext({
        user: defaultUser,
        ip: '127.0.0.1',
        headers: {},
        params: {},
      });
      const next = createMockCallHandler({ id: 42 });

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: null,
        }),
      );
    });
  });

  describe('metadata building', () => {
    const defaultUser = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      mid: 'mid-1',
    };

    it('builds metadata from request.body for specified metadataFields', async () => {
      // Arrange
      reflector.get.mockReturnValue({
        eventType: 'query.created',
        metadataFields: ['name', 'description'],
      });
      const { context } = createMockExecutionContext({
        user: defaultUser,
        ip: '127.0.0.1',
        headers: {},
        params: {},
        body: { name: 'My Query', description: 'A test query', secret: 'x' },
      });
      const next = createMockCallHandler({ id: 'q-1' });

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { name: 'My Query', description: 'A test query' },
        }),
      );
    });

    it('returns undefined metadata when no metadataFields are specified', async () => {
      // Arrange
      reflector.get.mockReturnValue({ eventType: 'query.deleted' });
      const { context } = createMockExecutionContext({
        user: defaultUser,
        ip: '127.0.0.1',
        headers: {},
        params: {},
        body: { name: 'ignored' },
      });
      const next = createMockCallHandler({});

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: undefined,
        }),
      );
    });

    it('returns undefined metadata when metadataFields is an empty array', async () => {
      // Arrange
      reflector.get.mockReturnValue({
        eventType: 'query.deleted',
        metadataFields: [],
      });
      const { context } = createMockExecutionContext({
        user: defaultUser,
        ip: '127.0.0.1',
        headers: {},
        params: {},
        body: { name: 'ignored' },
      });
      const next = createMockCallHandler({});

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: undefined,
        }),
      );
    });

    it('returns undefined metadata when specified body fields do not exist on request', async () => {
      // Arrange
      reflector.get.mockReturnValue({
        eventType: 'query.created',
        metadataFields: ['nonExistentField', 'anotherMissing'],
      });
      const { context } = createMockExecutionContext({
        user: defaultUser,
        ip: '127.0.0.1',
        headers: {},
        params: {},
        body: { name: 'present but not requested' },
      });
      const next = createMockCallHandler({});

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: undefined,
        }),
      );
    });

    it('includes only matching fields when some metadataFields are missing from body', async () => {
      // Arrange
      reflector.get.mockReturnValue({
        eventType: 'query.created',
        metadataFields: ['name', 'missing'],
      });
      const { context } = createMockExecutionContext({
        user: defaultUser,
        ip: '127.0.0.1',
        headers: {},
        params: {},
        body: { name: 'partial' },
      });
      const next = createMockCallHandler({});

      // Act
      const result$ = interceptor.intercept(context, next);
      await lastValueFrom(result$);

      // Assert
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { name: 'partial' },
        }),
      );
    });
  });

  describe('response passthrough', () => {
    it('returns the original response data unmodified', async () => {
      // Arrange
      reflector.get.mockReturnValue({ eventType: 'query.created' });
      const { context } = createMockExecutionContext({
        user: { userId: 'u-1', tenantId: 't-1', mid: 'm-1' },
        ip: '127.0.0.1',
        headers: {},
        params: {},
      });
      const responseData = { id: 'res-1', items: [1, 2, 3] };
      const next = createMockCallHandler(responseData);

      // Act
      const result$ = interceptor.intercept(context, next);
      const result = await lastValueFrom(result$);

      // Assert
      expect(result).toEqual(responseData);
    });
  });
});
