import { Logger } from "@nestjs/common";
import type {
  QueryDefinitionService,
  RlsContextService,
} from "@qpp/backend-shared";
import { auditLogs } from "@qpp/database";
import { createRlsContextStub, type RlsContextStub } from "@qpp/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellQuerySweeper } from "../shell-query.sweeper";

interface DbMock {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
}

function createDbMock(): DbMock {
  const limitFn = vi.fn();
  const whereFn = vi.fn(() => ({ limit: limitFn }));
  const fromFn = vi.fn(() => ({ where: whereFn }));
  const selectFn = vi.fn(() => ({ from: fromFn }));
  const valuesFn = vi.fn().mockResolvedValue(undefined);
  const insertFn = vi.fn(() => ({ values: valuesFn }));

  return {
    select: selectFn,
    insert: insertFn,
    where: whereFn,
    limit: limitFn,
    values: valuesFn,
  };
}

function setupDefaultDbResults(db: DbMock): void {
  const tenantSettingsResult: Record<string, unknown>[] & {
    limit?: ReturnType<typeof vi.fn>;
  } = [{ tenantId: "t1", mid: "m1", qppFolderId: 100 }];
  tenantSettingsResult.limit = vi.fn().mockReturnValue(tenantSettingsResult);

  const credentialsResult: Record<string, unknown>[] & {
    limit?: ReturnType<typeof vi.fn>;
  } = [{ userId: "u1" }];
  credentialsResult.limit = vi.fn().mockReturnValue(credentialsResult);

  db.where
    .mockReturnValueOnce(tenantSettingsResult)
    .mockReturnValueOnce(credentialsResult);
}

describe("ShellQuerySweeper – audit logging", () => {
  let sweeper: ShellQuerySweeper;
  let db: DbMock;
  let rlsContextStub: RlsContextStub;
  let qdServiceMock: {
    retrieveByFolder: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    vi.spyOn(Logger.prototype, "debug").mockImplementation(() => {});

    db = createDbMock();
    rlsContextStub = createRlsContextStub();
    qdServiceMock = {
      retrieveByFolder: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    setupDefaultDbResults(db);

    sweeper = new ShellQuerySweeper(
      qdServiceMock as unknown as QueryDefinitionService,
      rlsContextStub as unknown as RlsContextService,
      db as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts system.sweeper_run audit event after successful sweep", async () => {
    await sweeper.handleSweep();

    expect(db.insert).toHaveBeenCalledWith(auditLogs);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        mid: "m1",
        eventType: "system.sweeper_run",
        actorType: "system",
        actorId: null,
        targetId: "100",
      }),
    );
  });

  it("audit event metadata includes attemptedCount, deletedCount, failedCount, folderId", async () => {
    qdServiceMock.retrieveByFolder.mockResolvedValue([
      { objectId: "qd-1", customerKey: "QPP_Query_1" },
      { objectId: "qd-2", customerKey: "QPP_Query_2" },
      { objectId: null, customerKey: "QPP_Query_3" },
    ]);
    qdServiceMock.delete
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("MCE deletion error"));

    await sweeper.handleSweep();

    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          attemptedCount: 2,
          deletedCount: 1,
          failedCount: 1,
          folderId: 100,
        },
      }),
    );
  });

  it("continues if audit event insert fails and logs a warning", async () => {
    db.values.mockRejectedValueOnce(new Error("DB insert failed"));

    await expect(sweeper.handleSweep()).resolves.not.toThrow();

    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to log sweeper audit event"),
    );
  });
});
