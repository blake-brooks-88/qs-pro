import { promises as dns } from "node:dns";
import { URL } from "node:url";

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /\.local$/i,
  /\.internal$/i,
];

const PRIVATE_IP_RANGES = [
  { prefix: "127.", mask: 8 },
  { prefix: "10.", mask: 8 },
  { prefix: "0.", mask: 8 },
  { prefix: "169.254.", mask: 16 },
  { prefix: "192.168.", mask: 16 },
];

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fd")) {
    return true;
  }

  for (const range of PRIVATE_IP_RANGES) {
    if (ip.startsWith(range.prefix)) {
      return true;
    }
  }

  // 172.16.0.0/12
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1] ?? "", 10);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }

  return false;
}

/**
 * Synchronous check against the raw hostname string.
 * Use in Zod refinements or config-time validation.
 */
export function isPrivateHostname(hostname: string): boolean {
  return PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Validates a webhook URL is not targeting private/internal networks.
 * Returns null if safe, or an error message if blocked.
 */
export function validateWebhookUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (isPrivateHostname(parsed.hostname)) {
      return `Webhook URL hostname '${parsed.hostname}' resolves to a private/internal network`;
    }
    return null;
  } catch {
    return "Invalid URL";
  }
}

/**
 * Resolves the hostname via DNS and checks the resolved IP against private ranges.
 * Use before making outbound HTTP requests (delivery-time check).
 */
export async function assertPublicHostname(url: string): Promise<void> {
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  if (isPrivateHostname(hostname)) {
    throw new Error(
      `SSRF blocked: hostname '${hostname}' matches private network pattern`,
    );
  }

  const { address } = await dns.lookup(hostname);

  if (isPrivateIp(address)) {
    throw new Error(
      `SSRF blocked: hostname '${hostname}' resolves to private IP ${address}`,
    );
  }
}
