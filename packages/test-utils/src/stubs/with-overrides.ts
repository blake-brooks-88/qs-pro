export function withOverrides<T extends object>(
  base: T,
  overrides?: Partial<T>,
): T {
  if (!overrides) {
    return base;
  }
  return Object.assign(base, overrides);
}
