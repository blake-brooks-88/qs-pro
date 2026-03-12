import { z } from "zod";

export const OrgRoleSchema = z.enum(["owner", "admin", "member"]);
export type OrgRole = z.infer<typeof OrgRoleSchema>;

export const ROLE_WEIGHT: Record<OrgRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export type AdminAction =
  | "manage_members"
  | "manage_billing"
  | "transfer_ownership"
  | "view_audit_logs"
  | "manage_siem";

export const ROLE_PERMISSIONS: Record<OrgRole, readonly AdminAction[]> = {
  owner: [
    "manage_members",
    "manage_billing",
    "transfer_ownership",
    "view_audit_logs",
    "manage_siem",
  ],
  admin: ["manage_members", "view_audit_logs", "manage_siem"],
  member: [],
};

export function hasPermission(role: OrgRole, action: AdminAction): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(action);
}
