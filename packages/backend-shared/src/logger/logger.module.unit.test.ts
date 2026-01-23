import type { IncomingMessage } from "http";
import type { Options } from "pino-http";
import { describe, expect, it } from "vitest";

import {
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

    it("uses JSON transport in production", () => {
      const options = getPinoOptions("production", "text");
      expect(options.transport).toBeUndefined();
    });

    it("uses JSON transport when format is json", () => {
      const options = getPinoOptions("development", "json");
      expect(options.transport).toBeUndefined();
    });
  });
});
