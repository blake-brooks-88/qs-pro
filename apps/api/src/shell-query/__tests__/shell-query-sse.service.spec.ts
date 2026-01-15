import { Test, type TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { HttpException } from '@nestjs/common';
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
      duplicate: vi.fn().mockReturnValue(subscriber),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellQuerySseService,
        {
          provide: 'REDIS_CLIENT',
          useValue: redis,
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

    subscriber.emit(
      'message',
      'run-status:run-1',
      JSON.stringify({ status: 'queued' }),
    );
    await Promise.resolve();

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
    ).rejects.toBeInstanceOf(HttpException);
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
});
