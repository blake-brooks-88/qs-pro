import { randomUUID } from "node:crypto";

import { getNextUserSessionId } from "../setup/reset";

export type TestIds = {
  tenantId: string;
  userId: string;
  mid: string;
  eid: string;
  sfUserId: string;
};

export function createTestUuid(): string {
  return randomUUID();
}

export function createTestIds(overrides: Partial<TestIds> = {}): TestIds {
  const id = getNextUserSessionId();

  return {
    tenantId: randomUUID(),
    userId: randomUUID(),
    mid: `mid-${id}`,
    eid: `test---factory-${id}`,
    sfUserId: `sf-user-${id}`,
    ...overrides,
  };
}
