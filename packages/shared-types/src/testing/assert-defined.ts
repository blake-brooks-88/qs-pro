/**
 * Type-narrowing assertion for test code. Throws if value is undefined/null,
 * otherwise returns the value with narrowed type.
 */
export function assertDefined<T>(
  value: T | undefined | null,
  message = "Expected value to be defined",
): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}
