import { bufferEmbeddedJwt } from "@/services/embedded-jwt";

export const SENSITIVE_QUERY_PARAMS = ["jwt", "code", "state"] as const;

function isProbablyJwt(candidate: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate);
}

function buildRelativeHref(url: URL): string {
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

export function sanitizeUrlQueryParams(
  rawUrl: string,
  paramsToRemove: readonly string[],
  baseOrigin: string,
): { sanitizedUrl: string; removed: Record<string, string[]> } {
  const removed: Record<string, string[]> = {};

  let url: URL;
  try {
    url = new URL(rawUrl, baseOrigin);
  } catch {
    return { sanitizedUrl: rawUrl, removed };
  }

  const shouldReturnAbsolute = /^https?:\/\//i.test(rawUrl);

  for (const key of paramsToRemove) {
    const values = url.searchParams.getAll(key);
    if (values.length) {
      removed[key] = values;
      url.searchParams.delete(key);
    }
  }

  return {
    sanitizedUrl: shouldReturnAbsolute
      ? url.toString()
      : buildRelativeHref(url),
    removed,
  };
}

export function sanitizeCurrentLocationAndBufferJwt(
  win: Pick<Window, "location" | "history"> | null = typeof window !==
  "undefined"
    ? window
    : null,
): void {
  if (!win) {
    return;
  }

  const currentRelative = `${win.location.pathname}${win.location.search}${win.location.hash}`;
  const { sanitizedUrl, removed } = sanitizeUrlQueryParams(
    currentRelative,
    SENSITIVE_QUERY_PARAMS,
    win.location.origin,
  );

  if (Object.keys(removed).length === 0) {
    return;
  }

  const jwtCandidate = removed.jwt?.[0]?.trim() ?? null;
  if (jwtCandidate && isProbablyJwt(jwtCandidate)) {
    bufferEmbeddedJwt(jwtCandidate);
  }

  win.history.replaceState(null, "", sanitizedUrl);
}
