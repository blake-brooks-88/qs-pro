import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN_API ?? process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.APP_VERSION || 'dev',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  beforeSend(event) {
    if (event.request?.headers) {
      const sensitiveHeaders = new Set([
        'authorization',
        'cookie',
        'x-admin-key',
        'x-csrf-token',
        'x-xsrf-token',
      ]);
      for (const key of Object.keys(event.request.headers)) {
        if (sensitiveHeaders.has(key.toLowerCase())) {
          delete event.request.headers[key];
        }
      }
    }

    if (event.request?.data && typeof event.request.data === 'object') {
      const data = event.request.data as Record<string, unknown>;
      const sensitiveFields = [
        'password',
        'token',
        'secret',
        'sessionSecret',
        'accessToken',
        'refreshToken',
        'encryptedAccessToken',
        'encryptedRefreshToken',
      ];
      for (const field of sensitiveFields) {
        if (field in data) {
          (data as Record<string, string>)[field] = '[REDACTED]';
        }
      }
    }

    return event;
  },
  beforeSendTransaction(event) {
    const noisyRoutes = [
      'GET /livez',
      'GET /readyz',
      'GET /metrics',
      'GET /health',
    ];
    if (noisyRoutes.includes(event.transaction ?? '')) {
      return null;
    }
    return event;
  },
});
