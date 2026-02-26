import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DevGuard } from '../dev.guard';

function createConfigMock(nodeEnv?: string) {
  return {
    get: vi.fn().mockImplementation((key: string) => {
      if (key === 'NODE_ENV') {
        return nodeEnv;
      }
      return undefined;
    }),
  };
}

describe('DevGuard', () => {
  it('returns true when NODE_ENV is development', () => {
    const configMock = createConfigMock('development');
    const guard = new DevGuard(configMock as any);

    expect(guard.canActivate()).toBe(true);
  });

  it('throws ForbiddenException when NODE_ENV is production', () => {
    const configMock = createConfigMock('production');
    const guard = new DevGuard(configMock as any);

    expect(() => guard.canActivate()).toThrow(ForbiddenException);
    expect(() => guard.canActivate()).toThrow(
      'Dev tools are only available in development',
    );
  });

  it('throws ForbiddenException when NODE_ENV is test', () => {
    const configMock = createConfigMock('test');
    const guard = new DevGuard(configMock as any);

    expect(() => guard.canActivate()).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when NODE_ENV is staging', () => {
    const configMock = createConfigMock('staging');
    const guard = new DevGuard(configMock as any);

    expect(() => guard.canActivate()).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when NODE_ENV is undefined', () => {
    const configMock = createConfigMock(undefined);
    const guard = new DevGuard(configMock as any);

    expect(() => guard.canActivate()).toThrow(ForbiddenException);
  });
});
