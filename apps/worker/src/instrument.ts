import * as Sentry from "@sentry/nestjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN_WORKER ?? process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.APP_VERSION || "dev",
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  beforeSendTransaction(event) {
    const noisyRoutes = [
      "GET /livez",
      "GET /readyz",
      "GET /metrics",
      "GET /health",
    ];
    if (noisyRoutes.includes(event.transaction ?? "")) {
      return null;
    }
    return event;
  },
});
