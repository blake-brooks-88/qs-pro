import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { and, backofficeAuditLogs, eq } from "@qpp/database";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./setup.js";

describe("Settings Controller (integration)", () => {
  let app: NestFastifyApplication;
  let db: Awaited<ReturnType<typeof createTestApp>>["db"];
  const adminUserId = "bo-admin-settings";

  beforeAll(async () => {
    const created = await createTestApp({ userId: adminUserId, role: "admin" });
    app = created.app;
    db = created.db;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /settings/users/invite", () => {
    it("rejects invalid email", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/settings/users/invite",
        payload: { email: "not-an-email", role: "admin", name: "Test" },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toBe("Validation failed");
      expect(body.errors).toHaveProperty("email");
    });

    it.each(["viewer", "editor", "admin"] as const)(
      "accepts viewer/editor/admin roles (%s)",
      async (role) => {
        const [beforeRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(backofficeAuditLogs)
          .where(
            and(
              eq(backofficeAuditLogs.backofficeUserId, adminUserId),
              eq(backofficeAuditLogs.eventType, "backoffice.user_invited"),
            ),
          );
        const beforeCount = Number(beforeRow?.count ?? 0);

        const response = await app.inject({
          method: "POST",
          url: "/settings/users/invite",
          payload: {
            email: "test@example.com",
            role,
            name: "Test",
            temporaryPassword: "ValidPassword123456",
          },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json();
        expect(body).toEqual(
          expect.objectContaining({
            id: "new-user",
            email: "test@example.com",
            role,
          }),
        );

        await expect
          .poll(
            async () => {
              const [row] = await db
                .select({ count: sql<number>`count(*)` })
                .from(backofficeAuditLogs)
                .where(
                  and(
                    eq(backofficeAuditLogs.backofficeUserId, adminUserId),
                    eq(
                      backofficeAuditLogs.eventType,
                      "backoffice.user_invited",
                    ),
                  ),
                );
              return Number(row?.count ?? 0);
            },
            { timeout: 2_000, interval: 50 },
          )
          .toBe(beforeCount + 1);
      },
    );

    it("rejects invalid role", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/settings/users/invite",
        payload: {
          email: "test@example.com",
          role: "superadmin",
          name: "Test",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.errors).toHaveProperty("role");
    });

    it("rejects missing email field", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/settings/users/invite",
        payload: { role: "admin" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects missing role field", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/settings/users/invite",
        payload: { email: "test@example.com" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("PATCH /settings/users/:userId/role", () => {
    it.each(["viewer", "editor", "admin"] as const)(
      "accepts viewer/editor/admin roles (%s)",
      async (role) => {
        const [beforeRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(backofficeAuditLogs)
          .where(
            and(
              eq(backofficeAuditLogs.backofficeUserId, adminUserId),
              eq(backofficeAuditLogs.eventType, "backoffice.user_role_changed"),
            ),
          );
        const beforeCount = Number(beforeRow?.count ?? 0);

        const response = await app.inject({
          method: "PATCH",
          url: "/settings/users/some-user-id/role",
          payload: { role },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ success: true });

        await expect
          .poll(
            async () => {
              const [row] = await db
                .select({ count: sql<number>`count(*)` })
                .from(backofficeAuditLogs)
                .where(
                  and(
                    eq(backofficeAuditLogs.backofficeUserId, adminUserId),
                    eq(
                      backofficeAuditLogs.eventType,
                      "backoffice.user_role_changed",
                    ),
                  ),
                );
              return Number(row?.count ?? 0);
            },
            { timeout: 2_000, interval: 50 },
          )
          .toBe(beforeCount + 1);
      },
    );

    it("rejects demoting yourself from admin", async () => {
      const [beforeRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(backofficeAuditLogs)
        .where(
          and(
            eq(backofficeAuditLogs.backofficeUserId, adminUserId),
            eq(backofficeAuditLogs.eventType, "backoffice.user_role_changed"),
          ),
        );
      const beforeCount = Number(beforeRow?.count ?? 0);

      const response = await app.inject({
        method: "PATCH",
        url: `/settings/users/${adminUserId}/role`,
        payload: { role: "viewer" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(
        expect.objectContaining({
          message: "Cannot demote yourself from admin",
        }),
      );

      const [afterRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(backofficeAuditLogs)
        .where(
          and(
            eq(backofficeAuditLogs.backofficeUserId, adminUserId),
            eq(backofficeAuditLogs.eventType, "backoffice.user_role_changed"),
          ),
        );
      const afterCount = Number(afterRow?.count ?? 0);
      expect(afterCount).toBe(beforeCount);
    });

    it("rejects invalid role", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/settings/users/some-user-id/role",
        payload: { role: "superadmin" },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toBe("Validation failed");
      expect(body.errors).toHaveProperty("role");
    });

    it("rejects empty body", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/settings/users/some-user-id/role",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /settings/users/:userId/reset-password", () => {
    it("resets password and writes an audit log", async () => {
      const [beforeRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(backofficeAuditLogs)
        .where(
          and(
            eq(backofficeAuditLogs.backofficeUserId, adminUserId),
            eq(backofficeAuditLogs.eventType, "backoffice.user_password_reset"),
          ),
        );
      const beforeCount = Number(beforeRow?.count ?? 0);

      const response = await app.inject({
        method: "POST",
        url: "/settings/users/some-user-id/reset-password",
        payload: { newPassword: "ValidPassword123456" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ success: true });

      await expect
        .poll(
          async () => {
            const [row] = await db
              .select({ count: sql<number>`count(*)` })
              .from(backofficeAuditLogs)
              .where(
                and(
                  eq(backofficeAuditLogs.backofficeUserId, adminUserId),
                  eq(
                    backofficeAuditLogs.eventType,
                    "backoffice.user_password_reset",
                  ),
                ),
              );
            return Number(row?.count ?? 0);
          },
          { timeout: 2_000, interval: 50 },
        )
        .toBe(beforeCount + 1);
    });

    it("rejects password shorter than 16 chars", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/settings/users/some-user-id/reset-password",
        payload: { newPassword: "123456789012345" },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toBe("Validation failed");
    });

    it("rejects missing newPassword field", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/settings/users/some-user-id/reset-password",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

describe("Settings Controller — role-based access (integration)", () => {
  let viewerApp: NestFastifyApplication;

  beforeAll(async () => {
    ({ app: viewerApp } = await createTestApp({
      userId: "bo-viewer-settings",
      role: "viewer",
    }));
  });

  afterAll(async () => {
    await viewerApp.close();
  });

  it("viewer cannot list users (admin required)", async () => {
    const response = await viewerApp.inject({
      method: "GET",
      url: "/settings/users",
    });

    expect(response.statusCode).toBe(403);
  });

  it("viewer cannot invite users (admin required)", async () => {
    const response = await viewerApp.inject({
      method: "POST",
      url: "/settings/users/invite",
      payload: { email: "test@example.com", role: "admin", name: "Test" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("viewer cannot change user role (admin required)", async () => {
    const response = await viewerApp.inject({
      method: "PATCH",
      url: "/settings/users/some-user-id/role",
      payload: { role: "admin" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("viewer cannot ban user (admin required)", async () => {
    const response = await viewerApp.inject({
      method: "POST",
      url: "/settings/users/some-user-id/ban",
    });

    expect(response.statusCode).toBe(403);
  });

  it("viewer cannot reset user password (admin required)", async () => {
    const response = await viewerApp.inject({
      method: "POST",
      url: "/settings/users/some-user-id/reset-password",
      payload: { newPassword: "ValidPassword123!" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("viewer cannot remove user (admin required)", async () => {
    const response = await viewerApp.inject({
      method: "POST",
      url: "/settings/users/some-user-id/remove",
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("Settings Controller — editor role access (integration)", () => {
  let editorApp: NestFastifyApplication;

  beforeAll(async () => {
    ({ app: editorApp } = await createTestApp({
      userId: "bo-editor-settings",
      role: "editor",
    }));
  });

  afterAll(async () => {
    await editorApp.close();
  });

  it("editor cannot invite users (admin required)", async () => {
    const response = await editorApp.inject({
      method: "POST",
      url: "/settings/users/invite",
      payload: { email: "test@example.com", role: "admin", name: "Test" },
    });

    expect(response.statusCode).toBe(403);
  });
});
