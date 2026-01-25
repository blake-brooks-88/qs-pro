let bufferedJwt: string | null = null;
let listenerInitialized = false;

function isAllowedMceOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return (
      host === "mc.exacttarget.com" ||
      host.endsWith(".exacttarget.com") ||
      host.endsWith(".marketingcloudapps.com")
    );
  } catch {
    return false;
  }
}

function extractJwtFromUnknown(value: unknown): string | null {
  const isProbablyJwt = (candidate: string): boolean =>
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate);

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed && isProbablyJwt(trimmed) ? trimmed : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidate =
    record.jwt ??
    record.JWT ??
    record.token ??
    record.access_token ??
    record.accessToken ??
    record.ssoToken ??
    record.sso_token;

  if (typeof candidate !== "string") {
    return null;
  }
  const trimmed = candidate.trim();
  return trimmed && isProbablyJwt(trimmed) ? trimmed : null;
}

export function startEmbeddedJwtListener(targetWindow?: Window): void {
  const win = targetWindow ?? (typeof window !== "undefined" ? window : null);
  if (listenerInitialized || !win) {
    return;
  }
  listenerInitialized = true;

  win.addEventListener("message", (event: MessageEvent) => {
    // Only accept SSO JWTs from the parent MCE frame.
    if (win.self === win.top) {
      return;
    }
    if (event.source !== win.parent) {
      return;
    }
    if (!isAllowedMceOrigin(event.origin)) {
      return;
    }

    const jwt = extractJwtFromUnknown(event.data);
    if (!jwt) {
      return;
    }
    bufferedJwt = jwt;
  });
}

export function consumeEmbeddedJwt(): string | null {
  const jwt = bufferedJwt;
  bufferedJwt = null;
  return jwt;
}
