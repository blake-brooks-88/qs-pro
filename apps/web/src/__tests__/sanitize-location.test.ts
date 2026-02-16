import { beforeEach, describe, expect, it, vi } from "vitest";

describe("sanitize-location", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("removes jwt/code/state from an absolute URL while preserving other params", async () => {
    const { sanitizeUrlQueryParams, SENSITIVE_QUERY_PARAMS } =
      await import("../sanitize-location");

    const { sanitizedUrl, removed } = sanitizeUrlQueryParams(
      "https://example.com/path?jwt=aaa.bbb.ccc&code=oauth&state=xyz&keep=1",
      SENSITIVE_QUERY_PARAMS,
      "https://example.com",
    );

    expect(removed.jwt).toEqual(["aaa.bbb.ccc"]);
    expect(removed.code).toEqual(["oauth"]);
    expect(removed.state).toEqual(["xyz"]);
    expect(sanitizedUrl).toBe("https://example.com/path?keep=1");
  });

  it("returns a relative URL when given a relative URL", async () => {
    const { sanitizeUrlQueryParams, SENSITIVE_QUERY_PARAMS } =
      await import("../sanitize-location");

    const { sanitizedUrl } = sanitizeUrlQueryParams(
      "/?jwt=aaa.bbb.ccc&keep=1",
      SENSITIVE_QUERY_PARAMS,
      "https://example.com",
    );

    expect(sanitizedUrl).toBe("/?keep=1");
  });

  it("buffers a valid JWT and strips it from the current location", async () => {
    const { sanitizeCurrentLocationAndBufferJwt } =
      await import("../sanitize-location");
    const { consumeEmbeddedJwt } = await import("../services/embedded-jwt");

    const replaceState = vi.fn();
    const win = {
      location: {
        href: "https://example.com/?jwt=aaa.bbb.ccc&keep=1",
        origin: "https://example.com",
        pathname: "/",
        search: "?jwt=aaa.bbb.ccc&keep=1",
        hash: "",
      },
      history: { replaceState },
    };

    sanitizeCurrentLocationAndBufferJwt(win as never);

    expect(consumeEmbeddedJwt()).toBe("aaa.bbb.ccc");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?keep=1");
  });

  it("sanitizes a browser location when called with no arguments", async () => {
    const { sanitizeCurrentLocationAndBufferJwt } =
      await import("../sanitize-location");
    const { consumeEmbeddedJwt } = await import("../services/embedded-jwt");

    window.history.pushState(null, "", "/?jwt=aaa.bbb.ccc&keep=1");
    sanitizeCurrentLocationAndBufferJwt();

    expect(consumeEmbeddedJwt()).toBe("aaa.bbb.ccc");
    expect(window.location.search).toBe("?keep=1");
    window.history.replaceState(null, "", "/");
  });

  it("does nothing when no sensitive params are present", async () => {
    const { sanitizeCurrentLocationAndBufferJwt } =
      await import("../sanitize-location");
    const { consumeEmbeddedJwt } = await import("../services/embedded-jwt");

    const replaceState = vi.fn();
    const win = {
      location: {
        href: "https://example.com/?keep=1",
        origin: "https://example.com",
        pathname: "/",
        search: "?keep=1",
        hash: "",
      },
      history: { replaceState },
    };

    sanitizeCurrentLocationAndBufferJwt(win as never);

    expect(consumeEmbeddedJwt()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("returns the original URL when URL parsing fails", async () => {
    const { sanitizeUrlQueryParams, SENSITIVE_QUERY_PARAMS } =
      await import("../sanitize-location");

    const { sanitizedUrl, removed } = sanitizeUrlQueryParams(
      "http://%",
      SENSITIVE_QUERY_PARAMS,
      "https://example.com",
    );

    expect(sanitizedUrl).toBe("http://%");
    expect(removed).toEqual({});
  });

  it("is a no-op when sanitizeCurrentLocationAndBufferJwt is called with null", async () => {
    const { sanitizeCurrentLocationAndBufferJwt } =
      await import("../sanitize-location");

    expect(() => sanitizeCurrentLocationAndBufferJwt(null)).not.toThrow();
  });
});
