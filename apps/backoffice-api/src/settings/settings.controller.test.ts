import { BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { SettingsController } from "./settings.controller.js";

const mockAuthApi = {
  createUser: vi.fn(),
  setRole: vi.fn(),
  banUser: vi.fn(),
  removeUser: vi.fn(),
};

vi.mock("../auth/auth.js", () => ({
  getAuth: () => ({
    api: mockAuthApi,
  }),
}));

vi.mock("better-auth/node", () => ({
  fromNodeHeaders: vi.fn((headers: unknown) => headers),
}));

describe("SettingsController", () => {
  it("rejects demoting yourself from admin", async () => {
    const controller = new SettingsController({
      log: vi.fn().mockResolvedValue(undefined),
    } as never);

    const req = { headers: {}, ip: "127.0.0.1" } as unknown as FastifyRequest;

    await expect(
      controller.changeUserRole("me", { role: "viewer" }, { id: "me" }, req),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects banning yourself", async () => {
    const controller = new SettingsController({
      log: vi.fn().mockResolvedValue(undefined),
    } as never);

    const req = { headers: {}, ip: "127.0.0.1" } as unknown as FastifyRequest;

    await expect(controller.banUser("me", { id: "me" }, req)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rejects deleting yourself", async () => {
    const controller = new SettingsController({
      log: vi.fn().mockResolvedValue(undefined),
    } as never);

    const req = { headers: {}, ip: "127.0.0.1" } as unknown as FastifyRequest;

    await expect(
      controller.removeUser("me", { id: "me" }, req),
    ).rejects.toThrow(BadRequestException);
  });

  it("invites a user via Better Auth API and uses request headers", async () => {
    mockAuthApi.createUser.mockResolvedValue({
      user: {
        id: "new-user",
        email: "test@example.com",
        name: "Test User",
        role: "viewer",
      },
    });

    const auditLog = vi.fn().mockResolvedValue(undefined);
    const controller = new SettingsController({ log: auditLog } as never);

    const headers = { cookie: "sid=abc" };
    const req = { headers, ip: "127.0.0.1" } as unknown as FastifyRequest;

    const result = await controller.inviteUser(
      {
        email: "test@example.com",
        name: "Test User",
        role: "viewer",
        temporaryPassword: "valid-password-123",
      },
      { id: "admin-1" },
      req,
    );

    expect(mockAuthApi.createUser).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: "new-user",
      email: "test@example.com",
      name: "Test User",
      role: "viewer",
    });
  });
});
