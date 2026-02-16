import { Logger } from "@nestjs/common";

import { AppError } from "../common/errors/app-error";
import { ErrorCode } from "../common/errors/error-codes";

export const ALLOWED_MCE_HOST_PATTERNS: RegExp[] = [
  /^[a-z0-9-]+\.rest\.marketingcloudapis\.com$/,
  /^[a-z0-9-]+\.soap\.marketingcloudapis\.com$/,
  /^[a-z0-9-]+\.auth\.marketingcloudapis\.com$/,
];

export function isHostAllowed(url: string, extraHosts: string[]): boolean {
  const hostname = new URL(url).hostname.toLowerCase();

  if (ALLOWED_MCE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return true;
  }

  return extraHosts.some((host) => host.toLowerCase() === hostname);
}

export function validateOutboundHost(
  url: string,
  extraHosts: string[],
  policy: "log" | "block",
  logger: Logger,
): void {
  if (isHostAllowed(url, extraHosts)) {
    return;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = "unknown";
  }

  if (policy === "log") {
    logger.warn({ url, hostname }, "Outbound request to non-allowlisted host");
    return;
  }

  logger.error(
    { url, hostname },
    "Blocked outbound request to non-allowlisted host",
  );
  throw new AppError(ErrorCode.MCE_BAD_REQUEST, undefined, {
    operation: url,
    statusMessage: "Outbound host not allowed",
  });
}
