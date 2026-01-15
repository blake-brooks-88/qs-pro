import { HttpException, HttpStatus, Injectable, Inject } from '@nestjs/common';
import { Observable, filter, finalize, fromEventPattern, map } from 'rxjs';

type RedisSubscriber = {
  subscribe(channel: string): Promise<unknown>;
  quit(): Promise<unknown>;
  on(
    event: 'message',
    listener: (channel: string, message: string) => void,
  ): unknown;
  off(
    event: 'message',
    listener: (channel: string, message: string) => void,
  ): unknown;
};

type RedisClient = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  decr(key: string): Promise<number>;
  duplicate(): RedisSubscriber;
};

@Injectable()
export class ShellQuerySseService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: RedisClient) {}

  async streamRunEvents(
    runId: string,
    userId: string,
  ): Promise<Observable<MessageEvent>> {
    const limitKey = `sse-limit:${userId}`;
    const currentConnections = await this.redis.incr(limitKey);
    await this.redis.expire(limitKey, 3600);

    if (currentConnections > 5) {
      await this.redis.decr(limitKey);
      throw new HttpException(
        'Too many active connections',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const channel = `run-status:${runId}`;
    const subRedis = this.redis.duplicate();
    try {
      await subRedis.subscribe(channel);

      const wrappedHandlers = new Map<
        (value: [string, string]) => void,
        (receivedChannel: string, message: string) => void
      >();

      return fromEventPattern<[string, string]>(
        (handler) => {
          const wrappedHandler = (receivedChannel: string, message: string) => {
            handler([receivedChannel, message]);
          };
          wrappedHandlers.set(handler, wrappedHandler);
          subRedis.on('message', wrappedHandler);
        },
        (handler) => {
          const wrappedHandler = wrappedHandlers.get(handler);
          if (!wrappedHandler) return;
          wrappedHandlers.delete(handler);
          subRedis.off('message', wrappedHandler);
        },
      ).pipe(
        filter(([receivedChannel]) => channel === receivedChannel),
        map(([, message]) => {
          return { data: JSON.parse(message) } as MessageEvent;
        }),
        finalize(() => {
          void subRedis.quit();
          void this.redis.decr(limitKey);
        }),
      );
    } catch (error) {
      await this.redis.decr(limitKey);
      await subRedis.quit();
      throw error;
    }
  }
}
