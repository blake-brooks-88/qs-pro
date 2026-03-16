import { describe, expect, it } from "vitest";

import {
  type AdminAction,
  hasPermission,
  OrgRoleSchema,
  ROLE_WEIGHT,
} from "../roles";

const ALL_ACTIONS: AdminAction[] = [
  "manage_members",
  "manage_billing",
  "transfer_ownership",
  "view_audit_logs",
  "manage_siem",
];

describe("hasPermission", () => {
  describe("owner role", () => {
    it("has all five permissions", () => {
      for (const action of ALL_ACTIONS) {
        expect(hasPermission("owner", action)).toBe(true);
      }
    });
  });

  describe("admin role", () => {
    it("has manage_members, view_audit_logs, and manage_siem", () => {
      // Arrange
      const allowed: AdminAction[] = [
        "manage_members",
        "view_audit_logs",
        "manage_siem",
      ];

      // Act & Assert
      for (const action of allowed) {
        expect(hasPermission("admin", action)).toBe(true);
      }
    });

    it("does NOT have manage_billing or transfer_ownership", () => {
      // Arrange
      const denied: AdminAction[] = ["manage_billing", "transfer_ownership"];

      // Act & Assert
      for (const action of denied) {
        expect(hasPermission("admin", action)).toBe(false);
      }
    });
  });

  describe("member role", () => {
    it("has zero permissions", () => {
      for (const action of ALL_ACTIONS) {
        expect(hasPermission("member", action)).toBe(false);
      }
    });
  });
});

describe("ROLE_WEIGHT", () => {
  it("owner outranks admin, and admin outranks member", () => {
    expect(ROLE_WEIGHT.owner).toBeGreaterThan(ROLE_WEIGHT.admin);
    expect(ROLE_WEIGHT.admin).toBeGreaterThan(ROLE_WEIGHT.member);
  });
});

describe("OrgRoleSchema", () => {
  it.each(["owner", "admin", "member"])("accepts valid role: %s", (role) => {
    // Act
    const result = OrgRoleSchema.safeParse(role);

    // Assert
    expect(result.success).toBe(true);
  });

  it.each(["superadmin", "guest", "", 42, null, undefined])(
    "rejects invalid value: %s",
    (value) => {
      // Act
      const result = OrgRoleSchema.safeParse(value);

      // Assert
      expect(result.success).toBe(false);
    },
  );
});
