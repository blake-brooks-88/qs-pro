import { BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listUsersMock: vi.fn(),
  createUserMock: vi.fn(),
  setRoleMock: vi.fn(),
  banUserMock: vi.fn(),
  unbanUserMock: vi.fn(),
  setUserPasswordMock: vi.fn(),
  removeUserMock: vi.fn(),
}));

vi.mock("../auth/auth.js", () => ({
  auth: {
    api: {
      listUsers: mocks.listUsersMock,
      createUser: mocks.createUserMock,
      setRole: mocks.setRoleMock,
      banUser: mocks.banUserMock,
      unbanUser: mocks.unbanUserMock,
      setUserPassword: mocks.setUserPasswordMock,
      removeUser: mocks.removeUserMock,
    },
  },
}));

import { SettingsController } from "./settings.controller.js";

describe("SettingsController", () => {
  beforeEach(() => {
    mocks.listUsersMock.mockReset();
    mocks.createUserMock.mockReset();
    mocks.setRoleMock.mockReset();
    mocks.banUserMock.mockReset();
    mocks.unbanUserMock.mockReset();
    mocks.setUserPasswordMock.mockReset();
    mocks.removeUserMock.mockReset();
  });

  it("maps Better Auth users to API shape", async () => {
    mocks.listUsersMock.mockResolvedValueOnce({
      users: [
        {
          id: "u1",
          name: "User",
          email: "u@test.com",
          role: "admin",
          banned: null,
          createdAt: new Date("2026-03-08"),
        },
      ],
      total: 1,
    });

    const auditService = { log: vi.fn() };
    const controller = new SettingsController(auditService as never);

    const result = await controller.listUsers(
      { headers: {} } as unknown as FastifyRequest,
      { limit: 50, offset: 0 },
    );

    expect(result.total).toBe(1);
    expect(result.users).toEqual([
      expect.objectContaining({
        id: "u1",
        email: "u@test.com",
        role: "admin",
        banned: false,
      }),
    ]);
  });

  it("invites a user and writes an audit log", async () => {
    mocks.createUserMock.mockResolvedValueOnce({
      user: { id: "new-user", email: "new@test.com", name: "", role: "viewer" },
    });

    const auditService = { log: vi.fn() };
    const controller = new SettingsController(auditService as never);

    const req = {
      headers: { cookie: "a=b" },
      ip: "127.0.0.1",
    } as unknown as FastifyRequest;

    const response = await controller.inviteUser(
      {
        email: "new@test.com",
        role: "viewer",
        name: undefined,
        temporaryPassword: "ValidPassword123456",
      },
      { id: "admin-1" },
      req,
    );

    expect(response).toEqual({
      id: "new-user",
      email: "new@test.com",
      name: "",
      role: "viewer",
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        backofficeUserId: "admin-1",
        eventType: "backoffice.user_invited",
        ipAddress: "127.0.0.1",
      }),
    );
  });

  it("rejects an invalid temporary password", async () => {
    const auditService = { log: vi.fn() };
    const controller = new SettingsController(auditService as never);

    await expect(
      controller.inviteUser(
        {
          email: "new@test.com",
          role: "viewer",
          name: undefined,
          temporaryPassword: "short",
        },
        { id: "admin-1" },
        { headers: {}, ip: "127.0.0.1" } as unknown as FastifyRequest,
      ),
    ).rejects.toThrow();
  });

  it("prevents an admin from demoting themselves", async () => {
    const auditService = { log: vi.fn() };
    const controller = new SettingsController(auditService as never);

    await expect(
      controller.changeUserRole(
        "admin-1",
        { role: "viewer" },
        { id: "admin-1" },
        { ip: "127.0.0.1", headers: {} } as unknown as FastifyRequest,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("changes a user's role and writes an audit log", async () => {
    mocks.setRoleMock.mockResolvedValueOnce({});

    const auditService = { log: vi.fn() };
    const controller = new SettingsController(auditService as never);

    const result = await controller.changeUserRole(
      "user-2",
      { role: "editor" },
      { id: "admin-1" },
      { ip: "127.0.0.1", headers: {} } as unknown as FastifyRequest,
    );

    expect(result).toEqual({ success: true });
    expect(mocks.setRoleMock).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        backofficeUserId: "admin-1",
        eventType: "backoffice.user_role_changed",
        ipAddress: "127.0.0.1",
      }),
    );
  });

  it("prevents an admin from banning themselves", async () => {
    const auditService = { log: vi.fn() };
    const controller = new SettingsController(auditService as never);

    await expect(
      controller.banUser("admin-1", { id: "admin-1" }, {
        ip: "127.0.0.1",
        headers: {},
      } as unknown as FastifyRequest),
    ).rejects.toThrow("Cannot ban yourself");
  });

  it("bans a user and writes an audit log", async () => {
    mocks.banUserMock.mockResolvedValueOnce({});

    const auditService = { log: vi.fn() };
    const controller = new SettingsController(auditService as never);

    const result = await controller.banUser("user-2", { id: "admin-1" }, {
      ip: "127.0.0.1",
      headers: {},
    } as unknown as FastifyRequest);

    expect(result).toEqual({ success: true });
    expect(mocks.banUserMock).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "backoffice.user_banned",
      }),
    );
  });

  it("unbans a user and writes an audit log", async () => {
    mocks.unbanUserMock.mockResolvedValueOnce({});

    const auditService = { log: vi.fn() };
    const controller = new SettingsController(auditService as never);

    const result = await controller.unbanUser("user-2", { id: "admin-1" }, {
      ip: "127.0.0.1",
      headers: {},
    } as unknown as FastifyRequest);

    expect(result).toEqual({ success: true });
    expect(mocks.unbanUserMock).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "backoffice.user_unbanned",
      }),
    );
  });

  it("resets a user's password and writes an audit log", async () => {
    mocks.setUserPasswordMock.mockResolvedValueOnce({});

    const auditService = { log: vi.fn() };
    const controller = new SettingsController(auditService as never);

    const result = await controller.resetUserPassword(
      "user-2",
      { newPassword: "ValidPassword123456" },
      { id: "admin-1" },
      { ip: "127.0.0.1", headers: {} } as unknown as FastifyRequest,
    );

    expect(result).toEqual({ success: true });
    expect(mocks.setUserPasswordMock).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "backoffice.user_password_reset",
      }),
    );
  });

  it("prevents an admin from deleting themselves", async () => {
    const auditService = { log: vi.fn() };
    const controller = new SettingsController(auditService as never);

    await expect(
      controller.removeUser("admin-1", { id: "admin-1" }, {
        ip: "127.0.0.1",
        headers: {},
      } as unknown as FastifyRequest),
    ).rejects.toThrow("Cannot delete yourself");
  });

  it("removes a user and writes an audit log", async () => {
    mocks.removeUserMock.mockResolvedValueOnce({});

    const auditService = { log: vi.fn() };
    const controller = new SettingsController(auditService as never);

    const result = await controller.removeUser("user-2", { id: "admin-1" }, {
      ip: "127.0.0.1",
      headers: {},
    } as unknown as FastifyRequest);

    expect(result).toEqual({ success: true });
    expect(mocks.removeUserMock).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "backoffice.user_deleted",
      }),
    );
  });
});
