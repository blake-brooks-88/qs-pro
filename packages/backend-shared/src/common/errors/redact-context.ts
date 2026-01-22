const SENSITIVE_KEYS = /password|secret|key|token|auth|credential/i;
const MAX_STRING_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}... [truncated]`;
}

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.test(key)) {
    return "[REDACTED]";
  }
  if (typeof value === "string") {
    return truncateString(value, MAX_STRING_LENGTH);
  }
  return value;
}

export function redactContext(
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(ctx).map(([k, v]) => [k, redactValue(k, v)]),
  );
}

export function safeContext(ctx: unknown): Record<string, unknown> | undefined {
  if (!isRecord(ctx)) {
    return undefined;
  }
  return redactContext(ctx);
}
