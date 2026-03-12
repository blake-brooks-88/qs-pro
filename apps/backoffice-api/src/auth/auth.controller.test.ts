import type { FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { handlerMock } = vi.hoisted(() => ({
  handlerMock: vi.fn(),
}));

vi.mock("./auth.js", () => ({
  auth: {
    handler: handlerMock,
  },
}));

import { AuthController } from "./auth.controller.js";

function createReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    send: vi.fn().mockResolvedValue(undefined),
  };
  return reply as unknown as FastifyReply;
}

describe("AuthController", () => {
  beforeEach(() => {
    handlerMock.mockReset();
    delete process.env.BACKOFFICE_API_BASE_URL;
  });

  it("forwards the request to Better Auth using BACKOFFICE_API_BASE_URL when set", async () => {
    process.env.BACKOFFICE_API_BASE_URL = "https://api.example.com";
    handlerMock.mockResolvedValueOnce(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain", "set-cookie": "a=b" },
      }),
    );

    const controller = new AuthController();
    const reply = createReply();

    const req = {
      method: "GET",
      url: "/api/auth/session",
      protocol: "http",
      hostname: "localhost",
      headers: { "x-test": "1" },
      body: undefined,
    } as unknown as FastifyRequest;

    await controller.handleAuth(req, reply);

    expect(handlerMock).toHaveBeenCalledTimes(1);
    const request = handlerMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe("https://api.example.com/api/auth/session");

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.header).toHaveBeenCalledWith("content-type", "text/plain");
    expect(reply.header).toHaveBeenCalledWith("set-cookie", "a=b");
    expect(reply.send).toHaveBeenCalledWith("ok");
  });

  it("serializes JSON body for non-GET requests", async () => {
    handlerMock.mockResolvedValueOnce(new Response("", { status: 200 }));

    const controller = new AuthController();
    const reply = createReply();

    const req = {
      method: "POST",
      url: "/api/auth/sign-in",
      protocol: "https",
      hostname: "backoffice.local",
      headers: { "x-test": ["a", "b"] },
      body: { email: "a@b.com" },
    } as unknown as FastifyRequest;

    await controller.handleAuth(req, reply);

    const request = handlerMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe("https://backoffice.local/api/auth/sign-in");
    expect(request.headers.get("x-test")).toBe("a, b");
    expect(request.headers.get("content-type")).toBe("application/json");

    const body = await request.text();
    expect(body).toBe(JSON.stringify({ email: "a@b.com" }));

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith();
  });
});
