import { Test, TestingModule } from "@nestjs/testing";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDbFromContext,
  getReservedSqlFromContext,
  runWithDbContext,
} from "./db-context";
import { RlsContextService } from "./rls-context.service";

describe("RlsContextService", () => {
  let service: RlsContextService;
  let mockReservedSql: ReturnType<typeof createMockReservedSql>;
  const createDatabaseFromClient = vi
    .fn()
    .mockReturnValue({ mock: "db" } as unknown as PostgresJsDatabase<
      Record<string, unknown>
    >);

  function createMockReservedSql() {
    const configCalls: Array<{ key: string; value: string; local: boolean }> =
      [];
    const transactionCalls: string[] = [];
    const resetCalls: string[] = [];

    // Template string SQL call: sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    // strings = ["SELECT set_config('app.tenant_id', ", ", true)"]
    // values = [tenantId]
    const tagFn = vi
      .fn()
      .mockImplementation(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          const fullQuery = strings.reduce((acc, str, i) => {
            const val = values.at(i);
            return acc + str + (val !== undefined ? String(val) : "");
          }, "");

          if (fullQuery.includes("set_config")) {
            // Extract key from the static part: set_config('app.tenant_id',
            const keyMatch = strings[0]?.match(/set_config\s*\(\s*'([^']+)'/);
            // Check if it's local (true) or session (false) scope
            const isLocal = fullQuery.includes(", true)");
            if (keyMatch?.[1]) {
              configCalls.push({
                key: keyMatch[1],
                value: String(values[0] ?? ""),
                local: isLocal,
              });
            }
          } else if (fullQuery === "BEGIN") {
            transactionCalls.push("BEGIN");
          } else if (fullQuery === "COMMIT") {
            transactionCalls.push("COMMIT");
          } else if (fullQuery === "ROLLBACK") {
            transactionCalls.push("ROLLBACK");
          } else if (fullQuery.startsWith("RESET ")) {
            resetCalls.push(fullQuery);
          }
          return Promise.resolve([]);
        },
      );

    return Object.assign(tagFn, {
      release: vi.fn(),
      options: {},
      parameters: {},
      configCalls,
      transactionCalls,
      resetCalls,
    });
  }

  const mockSqlClient = {
    reserve: vi.fn(),
    options: {},
    parameters: {},
  };

  beforeEach(async () => {
    mockReservedSql = createMockReservedSql();
    mockSqlClient.reserve.mockResolvedValue(mockReservedSql);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RlsContextService,
        {
          provide: "CREATE_DATABASE_FROM_CLIENT",
          useValue: createDatabaseFromClient,
        },
        {
          provide: "SQL_CLIENT",
          useValue: mockSqlClient,
        },
      ],
    }).compile();

    service = module.get<RlsContextService>(RlsContextService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("runWithTenantContext", () => {
    it("should set tenant_id and mid config with local scope inside transaction", async () => {
      const result = await service.runWithTenantContext(
        "tenant-123",
        "mid-456",
        async () => "result",
      );

      expect(result).toBe("result");
      expect(mockReservedSql.configCalls).toContainEqual({
        key: "app.tenant_id",
        value: "tenant-123",
        local: true,
      });
      expect(mockReservedSql.configCalls).toContainEqual({
        key: "app.mid",
        value: "mid-456",
        local: true,
      });
    });

    it("should wrap operations in BEGIN/COMMIT transaction", async () => {
      await service.runWithTenantContext("t1", "m1", async () => "done");

      expect(mockReservedSql.transactionCalls).toEqual(["BEGIN", "COMMIT"]);
    });

    it("should release connection after transaction commits", async () => {
      await service.runWithTenantContext("t1", "m1", async () => "done");

      expect(mockReservedSql.release).toHaveBeenCalled();
    });

    it("should pass reservedSql to context for nested calls", async () => {
      let capturedReservedSql: unknown;

      await service.runWithTenantContext("t1", "m1", async () => {
        capturedReservedSql = getReservedSqlFromContext();
        return "done";
      });

      expect(capturedReservedSql).toBe(mockReservedSql);
    });

    it("should rollback transaction and release connection when callback throws", async () => {
      await expect(
        service.runWithTenantContext("t1", "m1", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      expect(mockReservedSql.transactionCalls).toContain("BEGIN");
      expect(mockReservedSql.transactionCalls).toContain("ROLLBACK");
      expect(mockReservedSql.transactionCalls).not.toContain("COMMIT");
      expect(mockReservedSql.release).toHaveBeenCalled();
    });
  });

  describe("runWithUserContext", () => {
    it("should set all three config values with local scope when no existing context", async () => {
      const result = await service.runWithUserContext(
        "tenant-123",
        "mid-456",
        "user-789",
        async () => "result",
      );

      expect(result).toBe("result");
      expect(mockReservedSql.configCalls).toContainEqual({
        key: "app.tenant_id",
        value: "tenant-123",
        local: true,
      });
      expect(mockReservedSql.configCalls).toContainEqual({
        key: "app.mid",
        value: "mid-456",
        local: true,
      });
      expect(mockReservedSql.configCalls).toContainEqual({
        key: "app.user_id",
        value: "user-789",
        local: true,
      });
    });

    it("should wrap operations in BEGIN/COMMIT transaction when no existing context", async () => {
      await service.runWithUserContext("t1", "m1", "u1", async () => "done");

      expect(mockReservedSql.transactionCalls).toEqual(["BEGIN", "COMMIT"]);
    });

    it("should reset app.user_id before releasing connection", async () => {
      await service.runWithUserContext("t1", "m1", "u1", async () => "done");

      expect(mockReservedSql.resetCalls).toContain("RESET app.user_id");
      expect(mockReservedSql.release).toHaveBeenCalled();
    });

    it("should reset app.user_id even when callback throws", async () => {
      await expect(
        service.runWithUserContext("t1", "m1", "u1", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      expect(mockReservedSql.resetCalls).toContain("RESET app.user_id");
      expect(mockReservedSql.release).toHaveBeenCalled();
    });

    it("should pass reservedSql to context", async () => {
      let capturedReservedSql: unknown;

      await service.runWithUserContext("t1", "m1", "u1", async () => {
        capturedReservedSql = getReservedSqlFromContext();
        return "done";
      });

      expect(capturedReservedSql).toBe(mockReservedSql);
    });
  });

  describe("nested runWithUserContext inside existing context", () => {
    it("should reuse existing reservedSql for set_config in nested call", async () => {
      const outerReservedSql = createMockReservedSql();
      mockSqlClient.reserve.mockResolvedValueOnce(outerReservedSql);

      await service.runWithTenantContext("t1", "m1", async () => {
        const innerResult = await service.runWithUserContext(
          "t1",
          "m1",
          "user-nested",
          async () => {
            const sql = getReservedSqlFromContext();
            expect(sql).toBe(outerReservedSql);
            return "nested-result";
          },
        );
        return innerResult;
      });

      // The nested call should have used the outer reserved connection for set_config
      // is_local=false because the hook's connection has no active transaction
      expect(outerReservedSql.configCalls).toContainEqual({
        key: "app.user_id",
        value: "user-nested",
        local: false,
      });

      // Should NOT have reserved a new connection for the nested call
      expect(mockSqlClient.reserve).toHaveBeenCalledTimes(1);
    });

    it("should not start new transaction in nested call (reuses outer transaction)", async () => {
      const outerReservedSql = createMockReservedSql();
      mockSqlClient.reserve.mockResolvedValueOnce(outerReservedSql);

      await service.runWithTenantContext("t1", "m1", async () => {
        await service.runWithUserContext("t1", "m1", "u1", async () => "done");
        return "outer-done";
      });

      // Only the outer context starts/commits the transaction
      expect(outerReservedSql.transactionCalls).toEqual(["BEGIN", "COMMIT"]);
    });

    it("should verify app.user_id applies inside nested runWithUserContext", async () => {
      const outerReservedSql = createMockReservedSql();
      mockSqlClient.reserve.mockResolvedValueOnce(outerReservedSql);

      await service.runWithTenantContext("tenant-1", "mid-1", async () => {
        // At this point tenant_id and mid are set
        expect(outerReservedSql.configCalls).toContainEqual({
          key: "app.tenant_id",
          value: "tenant-1",
          local: true,
        });
        expect(outerReservedSql.configCalls).toContainEqual({
          key: "app.mid",
          value: "mid-1",
          local: true,
        });

        await service.runWithUserContext(
          "tenant-1",
          "mid-1",
          "user-123",
          async () => {
            // Now user_id should also be set on the SAME connection
            // is_local=false because the hook's connection has no active transaction
            expect(outerReservedSql.configCalls).toContainEqual({
              key: "app.user_id",
              value: "user-123",
              local: false,
            });
            return "inner";
          },
        );
        return "outer";
      });

      // Verify only one connection was reserved (same connection used throughout)
      expect(mockSqlClient.reserve).toHaveBeenCalledTimes(1);
    });
  });

  describe("runWithIsolatedUserContext", () => {
    it("should always reserve a new connection and run inside its own transaction", async () => {
      const outerReservedSql = createMockReservedSql();
      const innerReservedSql = createMockReservedSql();

      mockSqlClient.reserve
        .mockResolvedValueOnce(outerReservedSql)
        .mockResolvedValueOnce(innerReservedSql);

      await service.runWithTenantContext("tenant-1", "mid-1", async () => {
        await service.runWithIsolatedUserContext(
          "tenant-1",
          "mid-1",
          "user-iso",
          async () => {
            expect(getReservedSqlFromContext()).toBe(innerReservedSql);
          },
        );
      });

      // Two reserves: one for the outer context, one for isolated user context.
      expect(mockSqlClient.reserve).toHaveBeenCalledTimes(2);

      // Isolated call should have its own transaction.
      expect(innerReservedSql.transactionCalls).toEqual(["BEGIN", "COMMIT"]);
      expect(innerReservedSql.configCalls).toContainEqual({
        key: "app.tenant_id",
        value: "tenant-1",
        local: true,
      });
      expect(innerReservedSql.configCalls).toContainEqual({
        key: "app.mid",
        value: "mid-1",
        local: true,
      });
      expect(innerReservedSql.configCalls).toContainEqual({
        key: "app.user_id",
        value: "user-iso",
        local: true,
      });
    });
  });

  describe("rollback failure handling", () => {
    let exitSpy: { mockRestore: () => void };
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
      exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      exitSpy.mockRestore();
    });

    it("should not release connection when rollback fails in production", async () => {
      process.env.NODE_ENV = "production";

      mockReservedSql.mockImplementation(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          const fullQuery = strings.reduce((acc, str, i) => {
            const val = values.at(i);
            return acc + str + (val !== undefined ? String(val) : "");
          }, "");

          if (fullQuery === "ROLLBACK") {
            return Promise.reject(new Error("connection lost"));
          }
          return Promise.resolve([]);
        },
      );

      await expect(
        service.runWithTenantContext("t1", "m1", async () => {
          throw new Error("callback failure");
        }),
      ).rejects.toThrow("callback failure");

      // Flush the setImmediate that wraps process.exit
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockReservedSql.release).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("should still release connection when rollback fails in non-production", async () => {
      process.env.NODE_ENV = "test";

      mockReservedSql.mockImplementation(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          const fullQuery = strings.reduce((acc, str, i) => {
            const val = values.at(i);
            return acc + str + (val !== undefined ? String(val) : "");
          }, "");

          if (fullQuery === "ROLLBACK") {
            return Promise.reject(new Error("connection lost"));
          }
          return Promise.resolve([]);
        },
      );

      await expect(
        service.runWithTenantContext("t1", "m1", async () => {
          throw new Error("callback failure");
        }),
      ).rejects.toThrow("callback failure");

      // Flush the setImmediate just in case
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockReservedSql.release).toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle error in nested callback and rollback outer transaction", async () => {
      const outerReservedSql = createMockReservedSql();
      mockSqlClient.reserve.mockResolvedValueOnce(outerReservedSql);

      await expect(
        service.runWithTenantContext("t1", "m1", async () => {
          await service.runWithUserContext("t1", "m1", "u1", async () => {
            throw new Error("Nested error");
          });
        }),
      ).rejects.toThrow("Nested error");

      // Transaction should be rolled back due to error
      expect(outerReservedSql.transactionCalls).toContain("BEGIN");
      expect(outerReservedSql.transactionCalls).toContain("ROLLBACK");
      expect(outerReservedSql.transactionCalls).not.toContain("COMMIT");
    });

    it("should create new context when called without existing context", async () => {
      const result = await service.runWithUserContext(
        "t1",
        "m1",
        "u1",
        async () => {
          expect(getDbFromContext()).toBeDefined();
          expect(getReservedSqlFromContext()).toBeDefined();
          return "fresh-context";
        },
      );

      expect(result).toBe("fresh-context");
      expect(mockSqlClient.reserve).toHaveBeenCalledTimes(1);
    });

    it("should skip nested context creation when existing context has no reservedSql", async () => {
      // Simulate a context without reservedSql (edge case for backwards compatibility)
      const mockDb = { mock: "db" };

      let reserveCallCount = 0;
      mockSqlClient.reserve.mockImplementation(() => {
        reserveCallCount++;
        return Promise.resolve(createMockReservedSql());
      });

      await runWithDbContext(mockDb as never, async () => {
        // Context exists but no reservedSql - should create new connection
        await service.runWithUserContext("t1", "m1", "u1", async () => "done");
      });

      // Should have reserved a new connection since no reservedSql in context
      expect(reserveCallCount).toBe(1);
    });
  });
});
