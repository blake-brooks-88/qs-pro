import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signPayload } from '../siem.service';

describe('signPayload', () => {
  it('returns a 64-character hex string signature', () => {
    const { signature } = signPayload('{"event":"test"}', 'my-secret');

    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns a Unix timestamp close to current time', () => {
    const before = Math.floor(Date.now() / 1000);
    const { timestamp } = signPayload('body', 'secret');
    const after = Math.floor(Date.now() / 1000);

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  describe('with fixed time', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('produces identical signatures for identical inputs', () => {
      const a = signPayload('same-body', 'same-secret');
      const b = signPayload('same-body', 'same-secret');

      expect(a.signature).toBe(b.signature);
      expect(a.timestamp).toBe(b.timestamp);
    });

    it('produces different signatures for different secrets', () => {
      const a = signPayload('same-body', 'secret-one');
      const b = signPayload('same-body', 'secret-two');

      expect(a.signature).not.toBe(b.signature);
    });

    it('produces different signatures for different bodies', () => {
      const a = signPayload('body-one', 'same-secret');
      const b = signPayload('body-two', 'same-secret');

      expect(a.signature).not.toBe(b.signature);
    });
  });
});
