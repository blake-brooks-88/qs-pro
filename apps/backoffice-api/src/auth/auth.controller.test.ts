import type { FastifyReply, FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthController } from "./auth.controller.js";

const mockHandler = vi.fn();

vi.mock("./auth.js", () => ({
  getAuth: () => ({
    handler: mockHandler,
  }),
}));

describe("AuthController", () => {
  const originalEnv = { ...process.env };

  function restoreEnv(): void {
    for (const key of Object.keys(process.env)) {
      // eslint-disable-next-line security/detect-object-injection -- env keys are controlled
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }

  beforeEach(() => {
    mockHandler.mockReset();
    restoreEnv();
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    restoreEnv();
  });

  it("uses BACKOFFICE_API_BASE_URL when set and preserves multiple set-cookie headers", async () => {
    process.env.BACKOFFICE_API_BASE_URL = "https://backoffice-api.example.com";

    const headers = new Headers();
    headers.append("set-cookie", "a=1; Path=/; HttpOnly");
    headers.append("set-cookie", "b=2; Path=/; HttpOnly");
    headers.set("content-type", "application/json");
    mockHandler.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers,
      }),
    );

    const req = {
      url: "/api/auth/session",
      protocol: "http",
      hostname: "evil.example.com",
      method: "POST",
      headers: { "x-forwarded-host": "evil.example.com" },
      body: { hello: "world" },
    } as unknown as FastifyRequest;

    const reply = {
      status: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as FastifyReply;

    const controller = new AuthController();
    await controller.handleAuth(req, reply);

    expect(mockHandler).toHaveBeenCalledTimes(1);
    const calledRequest = mockHandler.mock.calls[0]?.[0] as Request;
    expect(calledRequest.url).toBe(
      "https://backoffice-api.example.com/api/auth/session",
    );

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(reply.header).toHaveBeenCalledWith("set-cookie", [
      "a=1; Path=/; HttpOnly",
      "b=2; Path=/; HttpOnly",
    ]);
    const headerMock = reply.header as unknown as {
      mock: { calls: unknown[][] };
    };
    expect(
      headerMock.mock.calls.filter((call) => call[0] === "set-cookie"),
    ).toHaveLength(1);
    expect(reply.send).toHaveBeenCalledWith(JSON.stringify({ ok: true }));
  });

  it("throws in production when BACKOFFICE_API_BASE_URL is missing", async () => {
    delete process.env.BACKOFFICE_API_BASE_URL;
    process.env.NODE_ENV = "production";

    const req = {
      url: "/api/auth/session",
      protocol: "http",
      hostname: "localhost",
      method: "GET",
      headers: {},
    } as unknown as FastifyRequest;

    const reply = {
      status: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as FastifyReply;

    const controller = new AuthController();
    await expect(controller.handleAuth(req, reply)).rejects.toThrow(
      "BACKOFFICE_API_BASE_URL is required in production",
    );
  });
});
