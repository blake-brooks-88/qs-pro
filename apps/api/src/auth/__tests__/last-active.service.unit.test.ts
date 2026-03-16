import { afterEach, describe, expect, it, vi } from 'vitest';

import { LastActiveService } from '../last-active.service';

describe('LastActiveService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces last-active updates per user', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const userRepo = {
      updateLastActiveAt: vi.fn().mockResolvedValue(undefined),
    };

    const service = new LastActiveService(userRepo as never);

    await service.touchLastActive('user-1');
    await service.touchLastActive('user-1');

    expect(userRepo.updateLastActiveAt).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-01-01T00:05:00.001Z'));
    await service.touchLastActive('user-1');

    expect(userRepo.updateLastActiveAt).toHaveBeenCalledTimes(2);
  });

  it('does not throw if the repository update fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const userRepo = {
      updateLastActiveAt: vi.fn().mockRejectedValue(new Error('db down')),
    };

    const service = new LastActiveService(userRepo as never);

    await expect(service.touchLastActive('user-1')).resolves.toBeUndefined();
    expect(userRepo.updateLastActiveAt).toHaveBeenCalledTimes(1);
  });
});
