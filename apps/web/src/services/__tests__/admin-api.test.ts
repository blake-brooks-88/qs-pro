import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { server } from "@/test/mocks/server";

import {
  changeRole,
  getMembers,
  getMyRole,
  transferOwnership,
} from "../admin-api";

describe("admin-api service", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("getMembers() returns the members response payload", async () => {
    server.use(
      http.get("/api/admin/members", () => {
        return HttpResponse.json({
          members: [
            {
              id: "user-1",
              name: "Test",
              email: "test@example.com",
              role: "admin",
              lastActiveAt: null,
              joinedAt: null,
            },
          ],
        });
      }),
    );

    const result = await getMembers();

    expect(result.members).toHaveLength(1);
    expect(result.members[0]?.id).toBe("user-1");
    expect(result.members[0]?.role).toBe("admin");
  });

  it("changeRole() encodes the userId in the URL and sends the role payload", async () => {
    let capturedPath = "";
    let capturedBody: unknown;

    server.use(
      http.patch("/api/admin/members/:userId/role", async ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        capturedBody = await request.json();
        return HttpResponse.json({});
      }),
    );

    await changeRole("user/1", "member");

    expect(capturedPath).toBe("/api/admin/members/user%2F1/role");
    expect(capturedBody).toEqual({ role: "member" });
  });

  it("transferOwnership() posts newOwnerId", async () => {
    let capturedBody: unknown;

    server.use(
      http.post("/api/admin/transfer-ownership", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({});
      }),
    );

    await transferOwnership("user-2");

    expect(capturedBody).toEqual({ newOwnerId: "user-2" });
  });

  it("getMyRole() returns the current role payload", async () => {
    server.use(
      http.get("/api/admin/me/role", () => {
        return HttpResponse.json({ role: "owner" });
      }),
    );

    const result = await getMyRole();

    expect(result).toEqual({ role: "owner" });
  });
});
