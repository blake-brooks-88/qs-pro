export function isPreviewModeEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  if (import.meta.env.VITE_PREVIEW_MODE !== "1") return false;
  if (typeof window === "undefined") return false;

  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

