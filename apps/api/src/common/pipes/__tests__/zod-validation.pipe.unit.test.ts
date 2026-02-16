import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodValidationPipe } from '../zod-validation.pipe';

const TestSchema = z.object({
  name: z.string(),
  age: z.number(),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(TestSchema);

  it('returns parsed data for valid input', () => {
    const input = { name: 'Alice', age: 30 };
    const result = pipe.transform(input);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('returns result.data, stripping unknown fields', () => {
    const input = { name: 'Alice', age: 30, extra: true };
    const result = pipe.transform(input);
    expect(result).toEqual({ name: 'Alice', age: 30 });
    expect(result).not.toHaveProperty('extra');
  });

  it('throws BadRequestException for invalid input', () => {
    const input = { name: 123, age: 'not-a-number' };

    expect(() => pipe.transform(input)).toThrow(BadRequestException);
  });

  it('includes violations array in the thrown exception response', () => {
    const input = { name: 123, age: 'not-a-number' };

    try {
      pipe.transform(input);
      expect.unreachable('should have thrown');
    } catch (error) {
      const exception = error as BadRequestException;
      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.violations).toBeDefined();
      expect(Array.isArray(response.violations)).toBe(true);
    }
  });

  it('formats nested field violations as "path.field: message"', () => {
    const NestedSchema = z.object({
      user: z.object({
        name: z.string(),
      }),
    });
    const nestedPipe = new ZodValidationPipe(NestedSchema);

    try {
      nestedPipe.transform({ user: {} });
      expect.unreachable('should have thrown');
    } catch (error) {
      const exception = error as BadRequestException;
      const response = exception.getResponse() as Record<string, unknown>;
      const violations = response.violations as string[];
      expect(violations).toContainEqual(expect.stringContaining('user.name: '));
    }
  });

  it('omits path prefix for top-level validation errors', () => {
    const StringSchema = z.string();
    const stringPipe = new ZodValidationPipe(StringSchema);

    try {
      stringPipe.transform(123);
      expect.unreachable('should have thrown');
    } catch (error) {
      const exception = error as BadRequestException;
      const response = exception.getResponse() as Record<string, unknown>;
      const violations = response.violations as string[];
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).not.toMatch(/^: /);
    }
  });

  it('produces multiple violations for multiple invalid fields', () => {
    const input = {};

    try {
      pipe.transform(input);
      expect.unreachable('should have thrown');
    } catch (error) {
      const exception = error as BadRequestException;
      const response = exception.getResponse() as Record<string, unknown>;
      const violations = response.violations as string[];
      expect(violations.length).toBe(2);
      expect(violations).toContainEqual(expect.stringContaining('name: '));
      expect(violations).toContainEqual(expect.stringContaining('age: '));
    }
  });

  it('thrown error is an instance of BadRequestException', () => {
    try {
      pipe.transform({});
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
    }
  });
});
