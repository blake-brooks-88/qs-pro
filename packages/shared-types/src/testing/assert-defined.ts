export function assertDefined<T>(
  value: T | undefined | null,
  message = "Expected value to be defined",
): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
}
