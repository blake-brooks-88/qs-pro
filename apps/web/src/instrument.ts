import * as Sentry from "@sentry/react";

import {
  sanitizeUrlQueryParams,
  SENSITIVE_QUERY_PARAMS,
} from "./sanitize-location";

let sentryInitialized = false;

function sanitizeUrl(value: unknown): unknown {
  if (typeof value !== "string" || !value) {
    return value;
  }

  const { sanitizedUrl } = sanitizeUrlQueryParams(
    value,
    SENSITIVE_QUERY_PARAMS,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  return sanitizedUrl;
}

export function initSentry(): void {
  if (sentryInitialized) {
    return;
  }
  sentryInitialized = true;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || "dev",
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    beforeSend(event) {
      if (event.request?.url) {
        event.request.url = sanitizeUrl(event.request.url) as string;
      }
      if (event.breadcrumbs) {
        for (const crumb of event.breadcrumbs) {
          const data = crumb.data as Record<string, unknown> | undefined;
          if (data?.url) {
            data.url = sanitizeUrl(data.url);
          }
        }
      }
      return event;
    },
    beforeSendTransaction(event) {
      if (event.request?.url) {
        event.request.url = sanitizeUrl(event.request.url) as string;
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data && typeof breadcrumb.data === "object") {
        const data = breadcrumb.data as Record<string, unknown>;
        if (data.url) {
          data.url = sanitizeUrl(data.url);
        }
      }
      return breadcrumb;
    },
  });
}
