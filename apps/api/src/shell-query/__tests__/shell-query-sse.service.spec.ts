import { EventEmitter } from 'node:events';

import { Test, type TestingModule } from '@nestjs/testing';
import { EncryptionService, ErrorCode } from '@qpp/backend-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShellQuerySseService } from '../shell-query-sse.service';

type Subscriber = EventEmitter & {
  subscribe: (channel: string) => Promise<unknown>;
  quit: () => Promise<unknown>;
};

describe('ShellQuerySseService', () => {
  let service: ShellQuerySseService;
  let redis: {
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    decr: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    duplicate: ReturnType<typeof vi.fn>;
  };
  let subscriber: Subscriber;

  beforeEach(async () => {
    subscriber = Object.assign(new EventEmitter(), {
      subscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    });

    redis = {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      decr: vi.fn().mockResolvedValue(0),
      get: vi.fn().mockResolvedValue(null),
      duplicate: vi.fn().mockReturnValue(subscriber),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellQuerySseService,
        {
          provide: 'REDIS_CLIENT',
          useValue: redis,
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: vi.fn((value: string) => value),
            decrypt: vi.fn((value: string) => value),
          },
        },
      ],
    }).compile();

    service = module.get(ShellQuerySseService);
  });

  it('subscribes to run channel and decrements on finalize', async () => {
    // Arrange
    const messages: unknown[] = [];

    // Act
    const stream = await service.streamRunEvents('run-1', 'user-1');
    const subscription = stream.subscribe((event) => {
      messages.push(event.data);
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    subscriber.emit(
      'message',
      'run-status:run-1',
      JSON.stringify({ status: 'queued' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    subscription.unsubscribe();
    await Promise.resolve();

    // Assert
    expect(redis.incr).toHaveBeenCalledWith('sse-limit:user-1');
    expect(redis.expire).toHaveBeenCalledWith('sse-limit:user-1', 3600);
    expect(redis.duplicate).toHaveBeenCalledTimes(1);
    expect(subscriber.subscribe).toHaveBeenCalledWith('run-status:run-1');
    expect(messages).toEqual([{ status: 'queued' }]);
    expect(subscriber.quit).toHaveBeenCalledTimes(1);
    expect(redis.decr).toHaveBeenCalledWith('sse-limit:user-1');
  });

  it('enforces the per-user SSE limit', async () => {
    // Arrange
    redis.incr.mockResolvedValueOnce(6);

    // Act / Assert
    await expect(
      service.streamRunEvents('run-1', 'user-1'),
    ).rejects.toMatchObject({
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
    });
    expect(redis.decr).toHaveBeenCalledWith('sse-limit:user-1');
    expect(redis.duplicate).not.toHaveBeenCalled();
  });

  it('decrements on subscribe error', async () => {
    // Arrange
    vi.mocked(subscriber.subscribe).mockRejectedValueOnce(
      new Error('subscribe failed'),
    );

    // Act / Assert
    await expect(service.streamRunEvents('run-1', 'user-1')).rejects.toThrow(
      'subscribe failed',
    );
    expect(redis.decr).toHaveBeenCalledWith('sse-limit:user-1');
    expect(subscriber.quit).toHaveBeenCalledTimes(1);
  });

  describe('SSE reconnect backfill', () => {
    it('emits cached event immediately on subscribe when available', async () => {
      // Arrange
      const cachedEvent = {
        status: 'executing_query',
        message: 'Executing query...',
        timestamp: '2026-01-17T10:00:00.000Z',
        runId: 'run-1',
      };
      redis.get.mockResolvedValueOnce(JSON.stringify(cachedEvent));

      const messages: unknown[] = [];

      // Act
      const stream = await service.streamRunEvents('run-1', 'user-1');
      const subscription = stream.subscribe((event) => {
        messages.push(event.data);
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      subscription.unsubscribe();
      await Promise.resolve();

      // Assert
      expect(redis.get).toHaveBeenCalledWith('run-status:last:run-1');
      expect(messages).toContainEqual(cachedEvent);
    });

    it('emits cached event before live events', async () => {
      // Arrange
      const cachedEvent = {
        status: 'executing_query',
        message: 'Executing query...',
        timestamp: '2026-01-17T10:00:00.000Z',
        runId: 'run-1',
      };
      const liveEvent = {
        status: 'ready',
        message: 'Query completed',
        timestamp: '2026-01-17T10:00:05.000Z',
        runId: 'run-1',
      };
      redis.get.mockResolvedValueOnce(JSON.stringify(cachedEvent));

      const messages: unknown[] = [];

      // Act
      const stream = await service.streamRunEvents('run-1', 'user-1');
      const subscription = stream.subscribe((event) => {
        messages.push(event.data);
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      subscriber.emit('message', 'run-status:run-1', JSON.stringify(liveEvent));
      await new Promise((resolve) => setTimeout(resolve, 10));

      subscription.unsubscribe();
      await Promise.resolve();

      // Assert
      expect(messages.length).toBe(2);
      expect(messages[0]).toEqual(cachedEvent);
      expect(messages[1]).toEqual(liveEvent);
    });

    it('does not emit cached event when none exists', async () => {
      // Arrange
      redis.get.mockResolvedValueOnce(null);
      const liveEvent = {
        status: 'queued',
        message: 'Queued...',
        timestamp: '2026-01-17T10:00:00.000Z',
        runId: 'run-1',
      };

      const messages: unknown[] = [];

      // Act
      const stream = await service.streamRunEvents('run-1', 'user-1');
      const subscription = stream.subscribe((event) => {
        messages.push(event.data);
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      subscriber.emit('message', 'run-status:run-1', JSON.stringify(liveEvent));
      await new Promise((resolve) => setTimeout(resolve, 10));

      subscription.unsubscribe();
      await Promise.resolve();

      // Assert
      expect(redis.get).toHaveBeenCalledWith('run-status:last:run-1');
      expect(messages.length).toBe(1);
      expect(messages[0]).toEqual(liveEvent);
    });

    it('emits terminal state event on subscribe after completion', async () => {
      // Arrange
      const terminalEvent = {
        status: 'ready',
        message: 'Query completed',
        timestamp: '2026-01-17T10:00:00.000Z',
        runId: 'run-1',
      };
      redis.get.mockResolvedValueOnce(JSON.stringify(terminalEvent));

      const messages: unknown[] = [];

      // Act
      const stream = await service.streamRunEvents('run-1', 'user-1');
      const subscription = stream.subscribe((event) => {
        messages.push(event.data);
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      subscription.unsubscribe();
      await Promise.resolve();

      // Assert
      expect(messages).toContainEqual(terminalEvent);
      expect(messages[0]).toEqual(terminalEvent);
    });

    it('emits failed state event with error message on subscribe', async () => {
      // Arrange
      const failedEvent = {
        status: 'failed',
        message: 'Query failed: Syntax error near SELECT',
        errorMessage: 'Syntax error near SELECT',
        timestamp: '2026-01-17T10:00:00.000Z',
        runId: 'run-1',
      };
      redis.get.mockResolvedValueOnce(JSON.stringify(failedEvent));

      const messages: unknown[] = [];

      // Act
      const stream = await service.streamRunEvents('run-1', 'user-1');
      const subscription = stream.subscribe((event) => {
        messages.push(event.data);
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      subscription.unsubscribe();
      await Promise.resolve();

      // Assert
      expect(messages[0]).toEqual(failedEvent);
      expect((messages[0] as { errorMessage: string }).errorMessage).toBe(
        'Syntax error near SELECT',
      );
    });
  });
});
