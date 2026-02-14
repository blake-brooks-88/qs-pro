import type { QueryTab } from "@/features/editor-workspace/types";
import type { Tenant, User } from "@/store/auth-store";

export function createUserStub(overrides?: Partial<User>): User {
  return {
    id: "user-1",
    sfUserId: "005xx000001234AAA",
    email: "test@example.com",
    name: "Test User",
    ...overrides,
  };
}

export function createTenantStub(overrides?: Partial<Tenant>): Tenant {
  return {
    id: "tenant-1",
    eid: "100001234",
    tssd: "mcabc123.auth.marketingcloudapis.com",
    ...overrides,
  };
}

export function createTabStub(overrides?: Partial<QueryTab>): QueryTab {
  return {
    id: "tab-1",
    queryId: "sq-1",
    name: "Test Query",
    content: "SELECT 1",
    isDirty: false,
    ...overrides,
  };
}
