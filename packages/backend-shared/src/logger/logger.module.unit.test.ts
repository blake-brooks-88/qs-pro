import type { IncomingMessage } from "http";
import type { Options } from "pino-http";
import { afterEach, describe, expect, it } from "vitest";

import {
  AUTO_LOGGING_EXCLUDED_PATHS,
  createPinoHttpOptions,
  REDACTED_FIELD_PATHS,
  REDACTED_HEADER_PATHS,
  sanitizeRequest,
} from "./logger.module";

/**
 * Helper to extract pino-http options from the Params object.
 * The Params type is a union, so we need to narrow it.
 */
function getPinoOptions(
  nodeEnv: string,
  logFormat: string,
  logLevel?: string,
): Options {
  const params = createPinoHttpOptions(nodeEnv, logFormat, logLevel);
  return params.pinoHttp as Options;
}

describe("Logger Security", () => {
  describe("Header Redaction", () => {
    it("redacts authorization header", () => {
      expect(REDACTED_HEADER_PATHS).toContain("req.headers.authorization");
    });

    it("redacts cookie header", () => {
      expect(REDACTED_HEADER_PATHS).toContain("req.headers.cookie");
    });

    it("redacts x-admin-key header", () => {
      expect(REDACTED_HEADER_PATHS).toContain('req.headers["x-admin-key"]');
    });

    it("redacts x-csrf-token header", () => {
      expect(REDACTED_HEADER_PATHS).toContain('req.headers["x-csrf-token"]');
    });

    it("redacts x-xsrf-token header", () => {
      expect(REDACTED_HEADER_PATHS).toContain('req.headers["x-xsrf-token"]');
    });

    it("redacts x-csrftoken header", () => {
      expect(REDACTED_HEADER_PATHS).toContain('req.headers["x-csrftoken"]');
    });

    it("includes all header paths in pino config", () => {
      const options = getPinoOptions("development", "text");
      const redact = options.redact as { paths: string[] };

      for (const path of REDACTED_HEADER_PATHS) {
        expect(redact.paths).toContain(path);
      }
    });
  });

  describe("Field Redaction", () => {
    it("redacts password field", () => {
      expect(REDACTED_FIELD_PATHS).toContain("password");
    });

    it("redacts token field", () => {
      expect(REDACTED_FIELD_PATHS).toContain("token");
    });

    it("redacts secret field", () => {
      expect(REDACTED_FIELD_PATHS).toContain("secret");
    });

    it("redacts sessionSecret field", () => {
      expect(REDACTED_FIELD_PATHS).toContain("sessionSecret");
    });

    it("includes all field paths in pino config", () => {
      const options = getPinoOptions("development", "text");
      const redact = options.redact as { paths: string[] };

      for (const path of REDACTED_FIELD_PATHS) {
        expect(redact.paths).toContain(path);
      }
    });
  });

  describe("URL Query String Stripping", () => {
    function createMockRequest(
      url: string,
      method = "GET",
    ): Partial<IncomingMessage> {
      return {
        url,
        method,
        headers: {},
        socket: { remoteAddress: "127.0.0.1", remotePort: 12345 },
      } as Partial<IncomingMessage>;
    }

    it("strips query string from OAuth callback URL", () => {
      const req = createMockRequest(
        "/auth/callback?code=secret_oauth_code&state=abc123",
      );
      const sanitized = sanitizeRequest(req as IncomingMessage);

      expect(sanitized.url).toBe("/auth/callback");
      expect(sanitized.url).not.toContain("code=");
      expect(sanitized.url).not.toContain("state=");
    });

    it("strips query string from any URL with params", () => {
      const req = createMockRequest("/api/users?token=secret&session=xyz");
      const sanitized = sanitizeRequest(req as IncomingMessage);

      expect(sanitized.url).toBe("/api/users");
    });

    it("preserves URL without query string", () => {
      const req = createMockRequest("/api/health");
      const sanitized = sanitizeRequest(req as IncomingMessage);

      expect(sanitized.url).toBe("/api/health");
    });

    it("handles empty URL", () => {
      const req = createMockRequest("");
      const sanitized = sanitizeRequest(req as IncomingMessage);

      expect(sanitized.url).toBe("");
    });

    it("handles URL with only query string", () => {
      const req = createMockRequest("?code=secret");
      const sanitized = sanitizeRequest(req as IncomingMessage);

      expect(sanitized.url).toBe("");
    });

    it("handles undefined URL", () => {
      const req = { headers: {}, socket: {} } as Partial<IncomingMessage>;
      const sanitized = sanitizeRequest(req as IncomingMessage);

      expect(sanitized.url).toBe("");
    });

    it("preserves other request properties", () => {
      const req = createMockRequest("/api/test?secret=value", "POST");
      (req as { id?: string }).id = "req-123";
      const sanitized = sanitizeRequest(req as IncomingMessage);

      expect(sanitized.id).toBe("req-123");
      expect(sanitized.method).toBe("POST");
      expect(sanitized.remoteAddress).toBe("127.0.0.1");
      expect(sanitized.remotePort).toBe(12345);
    });

    it("includes headers for downstream redaction", () => {
      const req = createMockRequest("/api/test");
      req.headers = { authorization: "Bearer secret", "x-custom": "value" };
      const sanitized = sanitizeRequest(req as IncomingMessage);

      expect(sanitized.headers).toEqual({
        authorization: "Bearer secret",
        "x-custom": "value",
      });
    });
  });

  describe("Log Level Configuration", () => {
    it("uses explicit log level when provided", () => {
      const options = getPinoOptions("development", "text", "warn");
      expect(options.level).toBe("warn");
    });

    it("defaults to debug in development when not specified", () => {
      const options = getPinoOptions("development", "text");
      expect(options.level).toBe("debug");
    });

    it("defaults to info in production when not specified", () => {
      const options = getPinoOptions("production", "text");
      expect(options.level).toBe("info");
    });
  });

  describe("Transport Configuration", () => {
    it("uses pino-pretty in development with text format", () => {
      const options = getPinoOptions("development", "text");
      expect(options.transport).toEqual({
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard" },
      });
    });

    it("uses no transport in production without LOKI_HOST", () => {
      const options = getPinoOptions("production", "text");
      expect(options.transport).toBeUndefined();
    });

    it("uses no transport when format is json without LOKI_HOST", () => {
      const options = getPinoOptions("development", "json");
      expect(options.transport).toBeUndefined();
    });
  });

  describe("Auto-Logging Exclusions", () => {
    it("excludes /health from auto-logging", () => {
      expect(AUTO_LOGGING_EXCLUDED_PATHS.has("/health")).toBe(true);
    });

    it("excludes /livez from auto-logging", () => {
      expect(AUTO_LOGGING_EXCLUDED_PATHS.has("/livez")).toBe(true);
    });

    it("excludes /readyz from auto-logging", () => {
      expect(AUTO_LOGGING_EXCLUDED_PATHS.has("/readyz")).toBe(true);
    });

    it("excludes /metrics from auto-logging", () => {
      expect(AUTO_LOGGING_EXCLUDED_PATHS.has("/metrics")).toBe(true);
    });

    it("does not exclude regular API paths", () => {
      expect(AUTO_LOGGING_EXCLUDED_PATHS.has("/api/users")).toBe(false);
    });

    it("ignore function uses the excluded paths set", () => {
      const options = getPinoOptions("development", "text");
      const autoLogging = options.autoLogging as {
        ignore: (req: IncomingMessage) => boolean;
      };

      const healthReq = { url: "/livez" } as IncomingMessage;
      const apiReq = { url: "/api/users" } as IncomingMessage;

      expect(autoLogging.ignore(healthReq)).toBe(true);
      expect(autoLogging.ignore(apiReq)).toBe(false);
    });
  });

  describe("Pino-Loki Transport", () => {
    const ORIGINAL_ENV = { ...process.env };

    interface TransportTarget {
      target: string;
      options: Record<string, unknown>;
      level?: string;
    }

    function getTransportTargets(options: Options): TransportTarget[] {
      const transport = options.transport as
        | { targets: TransportTarget[] }
        | undefined;
      expect(transport).toBeDefined();
      return (transport as { targets: TransportTarget[] }).targets;
    }

    function lokiTarget(targets: TransportTarget[]): TransportTarget {
      const target = targets[0];
      expect(target).toBeDefined();
      return target as TransportTarget;
    }

    function stdoutTarget(targets: TransportTarget[]): TransportTarget {
      const target = targets[1];
      expect(target).toBeDefined();
      return target as TransportTarget;
    }

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    it("includes pino-loki target when LOKI_HOST is set", () => {
      process.env.LOKI_HOST = "http://loki:3100";

      const options = getPinoOptions("production", "json");
      const targets = getTransportTargets(options);

      expect(targets).toHaveLength(2);
      expect(lokiTarget(targets).target).toBe("pino-loki");
      expect(lokiTarget(targets).options.host).toBe("http://loki:3100");
    });

    it("includes stdout target alongside pino-loki", () => {
      process.env.LOKI_HOST = "http://loki:3100";

      const options = getPinoOptions("production", "json");
      const targets = getTransportTargets(options);

      expect(stdoutTarget(targets).target).toBe("pino/file");
      expect(stdoutTarget(targets).options.destination).toBe(1);
    });

    it("includes basicAuth when LOKI_USERNAME and LOKI_PASSWORD are set", () => {
      process.env.LOKI_HOST = "http://loki:3100";
      process.env.LOKI_USERNAME = "admin";
      process.env.LOKI_PASSWORD = "secret";

      const options = getPinoOptions("production", "json");
      const targets = getTransportTargets(options);

      expect(lokiTarget(targets).options.basicAuth).toEqual({
        username: "admin",
        password: "secret",
      });
    });

    it("omits basicAuth when LOKI_USERNAME is not set", () => {
      process.env.LOKI_HOST = "http://loki:3100";
      delete process.env.LOKI_USERNAME;
      delete process.env.LOKI_PASSWORD;

      const options = getPinoOptions("production", "json");
      const targets = getTransportTargets(options);

      expect(lokiTarget(targets).options.basicAuth).toBeUndefined();
    });

    it("uses SERVICE_NAME for loki labels", () => {
      process.env.LOKI_HOST = "http://loki:3100";
      process.env.SERVICE_NAME = "qpp-api";

      const options = getPinoOptions("production", "json");
      const targets = getTransportTargets(options);
      const labels = lokiTarget(targets).options.labels as {
        app: string;
        env: string;
      };

      expect(labels.app).toBe("qpp-api");
      expect(labels.env).toBe("production");
    });

    it("does not include pino-loki in development mode", () => {
      process.env.LOKI_HOST = "http://loki:3100";

      const options = getPinoOptions("development", "text");

      expect(options.transport).toEqual({
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard" },
      });
    });
  });
});
