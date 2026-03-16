import type { OrgRole } from "@qpp/shared-types";

import api from "@/services/api";

export interface MemberListItem {
  id: string;
  name: string | null;
  email: string | null;
  role: OrgRole;
  lastActiveAt: string | null;
  joinedAt: string | null;
}

interface MembersResponse {
  members: MemberListItem[];
}

export async function getMembers(): Promise<MembersResponse> {
  const { data } = await api.get<MembersResponse>("/admin/members");
  return data;
}

export async function changeRole(
  userId: string,
  role: "admin" | "member",
): Promise<void> {
  await api.patch(`/admin/members/${encodeURIComponent(userId)}/role`, {
    role,
  });
}

export async function transferOwnership(newOwnerId: string): Promise<void> {
  await api.post("/admin/transfer-ownership", { newOwnerId });
}

export async function getMyRole(): Promise<{ role: OrgRole }> {
  const { data } = await api.get<{ role: OrgRole }>("/admin/me/role");
  return data;
}
