import { promises as dns } from "node:dns";
import { isIP } from "node:net";
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
  // Carrier-grade NAT (RFC 6598)
  { prefix: "100.64.", mask: 10 },
  { prefix: "169.254.", mask: 16 },
  { prefix: "192.168.", mask: 16 },
];

function normalizeIp(address: string): string {
  // Strip IPv6 zone index (e.g. "fe80::1%lo0")
  const withoutZone = address.split("%")[0] ?? address;
  // Normalize IPv4-mapped IPv6 ("::ffff:10.0.0.1")
  if (withoutZone.toLowerCase().startsWith("::ffff:")) {
    return withoutZone.slice("::ffff:".length);
  }
  return withoutZone;
}

function isPrivateIp(ip: string): boolean {
  const normalized = normalizeIp(ip);

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (normalized.toLowerCase().startsWith("fe80:")) {
    return true;
  }

  // Unique local addresses (fc00::/7)
  if (
    normalized.toLowerCase().startsWith("fc") ||
    normalized.toLowerCase().startsWith("fd")
  ) {
    return true;
  }

  for (const range of PRIVATE_IP_RANGES) {
    if (normalized.startsWith(range.prefix)) {
      return true;
    }
  }

  // 172.16.0.0/12
  if (normalized.startsWith("172.")) {
    const second = parseInt(normalized.split(".")[1] ?? "", 10);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }

  // Validate CGNAT range precisely (100.64.0.0/10) when normalized looks like IPv4.
  if (normalized.startsWith("100.")) {
    const second = parseInt(normalized.split(".")[1] ?? "", 10);
    if (second >= 64 && second <= 127) {
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

  const records = await dns.lookup(hostname, { all: true });

  for (const { address } of records) {
    const normalized = normalizeIp(address);
    if (isIP(normalized) === 0) {
      continue;
    }
    if (isPrivateIp(normalized)) {
      throw new Error(
        `SSRF blocked: hostname '${hostname}' resolves to private IP ${address}`,
      );
    }
  }
}
