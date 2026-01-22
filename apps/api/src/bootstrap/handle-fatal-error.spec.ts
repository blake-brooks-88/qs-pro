import { AppError, ErrorCode } from '@qpp/backend-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleFatalError } from './handle-fatal-error';

describe('handleFatalError', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('exits with code 1 for AppError', () => {
    const mockExit = vi.fn() as unknown as (code: number) => never;
    const error = new AppError(ErrorCode.CONFIG_ERROR, undefined, {
      statusMessage: 'FOO is required',
    });

    handleFatalError(error, mockExit);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('logs error code and message for AppError', () => {
    const mockExit = vi.fn() as unknown as (code: number) => never;
    const error = new AppError(ErrorCode.CONFIG_ERROR, undefined, {
      statusMessage: 'FOO is required',
    });

    handleFatalError(error, mockExit);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('CONFIG_ERROR'),
    );
  });

  it('redacts sensitive context keys', () => {
    const mockExit = vi.fn() as unknown as (code: number) => never;
    const error = new AppError(ErrorCode.CONFIG_ERROR, undefined, {
      // Cast to any to test redaction with non-standard context keys
    } as any);
    // Override context to include sensitive keys for testing
    (error as any).context = {
      apiKey: 'secret123',
      operation: 'visible',
    };

    handleFatalError(error, mockExit);

    const allCalls = consoleSpy.mock.calls.flat().join(' ');
    expect(allCalls).toContain('[REDACTED]');
    expect(allCalls).not.toContain('secret123');
    expect(allCalls).toContain('visible');
  });

  it('handles plain Error', () => {
    const mockExit = vi.fn() as unknown as (code: number) => never;
    const error = new Error('Something broke');

    handleFatalError(error, mockExit);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Something broke'),
    );
  });

  it('handles unknown error types', () => {
    const mockExit = vi.fn() as unknown as (code: number) => never;
    const error = 'string error';

    handleFatalError(error, mockExit);

    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
