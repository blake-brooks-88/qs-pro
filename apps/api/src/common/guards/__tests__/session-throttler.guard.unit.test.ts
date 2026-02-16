import { describe, expect, it } from 'vitest';

import { SessionThrottlerGuard } from '../session-throttler.guard';

function createGuard(): SessionThrottlerGuard {
  return Object.create(
    SessionThrottlerGuard.prototype,
  ) as SessionThrottlerGuard;
}

function callGetTracker(
  guard: SessionThrottlerGuard,
  req: Record<string, unknown>,
): Promise<string> {
  return (
    guard as unknown as {
      getTracker(req: Record<string, unknown>): Promise<string>;
    }
  ).getTracker(req);
}

describe('SessionThrottlerGuard', () => {
  const guard = createGuard();

  it('returns userId when session contains a valid string userId', async () => {
    const req = {
      session: {
        get: (key: string) => (key === 'userId' ? 'user-abc-123' : undefined),
      },
      ip: '10.0.0.1',
    } as unknown as Record<string, unknown>;

    const tracker = await callGetTracker(guard, req);

    expect(tracker).toBe('user-abc-123');
  });

  it('falls back to IP when session userId is empty string', async () => {
    const req = {
      session: {
        get: (key: string) => (key === 'userId' ? '' : undefined),
      },
      ip: '192.168.1.1',
    } as unknown as Record<string, unknown>;

    const tracker = await callGetTracker(guard, req);

    expect(tracker).toBe('192.168.1.1');
  });

  it('falls back to IP when session userId is undefined', async () => {
    const req = {
      session: {
        get: () => undefined,
      },
      ip: '172.16.0.1',
    } as unknown as Record<string, unknown>;

    const tracker = await callGetTracker(guard, req);

    expect(tracker).toBe('172.16.0.1');
  });

  it('falls back to IP when session is missing', async () => {
    const req = {
      ip: '10.0.0.2',
    } as unknown as Record<string, unknown>;

    const tracker = await callGetTracker(guard, req);

    expect(tracker).toBe('10.0.0.2');
  });

  it('returns unknown when no session and no IP', async () => {
    const req = {} as Record<string, unknown>;

    const tracker = await callGetTracker(guard, req);

    expect(tracker).toBe('unknown');
  });
});
