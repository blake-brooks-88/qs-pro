import { Test, TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDbFromContext,
  getReservedSqlFromContext,
  runWithDbContext,
} from "./db-context";
import { RlsContextService } from "./rls-context.service";

vi.mock("@qpp/database", () => ({
  createDatabaseFromClient: vi.fn().mockReturnValue({ mock: "db" }),
}));

describe("RlsContextService", () => {
  let service: RlsContextService;
  let mockReservedSql: ReturnType<typeof createMockReservedSql>;

  function createMockReservedSql() {
    const configCalls: Array<{ key: string; value: string }> = [];
    const resetCalls: string[] = [];

    // Template string SQL call: sql`SELECT set_config('app.tenant_id', ${tenantId}, false)`
    // strings = ["SELECT set_config('app.tenant_id', ", ", false)"]
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
            if (keyMatch?.[1]) {
              configCalls.push({
                key: keyMatch[1],
                value: String(values[0] ?? ""),
              });
            }
          } else if (fullQuery.includes("RESET")) {
            const match = strings[0]?.match(/RESET\s+(\S+)/);
            if (match?.[1]) {
              resetCalls.push(match[1]);
            }
          }
          return Promise.resolve([]);
        },
      );

    return Object.assign(tagFn, {
      release: vi.fn(),
      options: {},
      parameters: {},
      configCalls,
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
    it("should set tenant_id and mid config on reserved connection", async () => {
      const result = await service.runWithTenantContext(
        "tenant-123",
        "mid-456",
        async () => "result",
      );

      expect(result).toBe("result");
      expect(mockReservedSql.configCalls).toContainEqual({
        key: "app.tenant_id",
        value: "tenant-123",
      });
      expect(mockReservedSql.configCalls).toContainEqual({
        key: "app.mid",
        value: "mid-456",
      });
    });

    it("should release connection and reset config on completion", async () => {
      await service.runWithTenantContext("t1", "m1", async () => "done");

      expect(mockReservedSql.release).toHaveBeenCalled();
      expect(mockReservedSql.resetCalls).toContain("app.tenant_id");
      expect(mockReservedSql.resetCalls).toContain("app.mid");
    });

    it("should pass reservedSql to context for nested calls", async () => {
      let capturedReservedSql: unknown;

      await service.runWithTenantContext("t1", "m1", async () => {
        capturedReservedSql = getReservedSqlFromContext();
        return "done";
      });

      expect(capturedReservedSql).toBe(mockReservedSql);
    });
  });

  describe("runWithUserContext", () => {
    it("should set all three config values when no existing context", async () => {
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
      });
      expect(mockReservedSql.configCalls).toContainEqual({
        key: "app.mid",
        value: "mid-456",
      });
      expect(mockReservedSql.configCalls).toContainEqual({
        key: "app.user_id",
        value: "user-789",
      });
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
      expect(outerReservedSql.configCalls).toContainEqual({
        key: "app.user_id",
        value: "user-nested",
      });

      // Should NOT have reserved a new connection for the nested call
      expect(mockSqlClient.reserve).toHaveBeenCalledTimes(1);
    });

    it("should reset user_id after nested call completes", async () => {
      const outerReservedSql = createMockReservedSql();
      mockSqlClient.reserve.mockResolvedValueOnce(outerReservedSql);

      await service.runWithTenantContext("t1", "m1", async () => {
        await service.runWithUserContext("t1", "m1", "u1", async () => "done");
        return "outer-done";
      });

      expect(outerReservedSql.resetCalls).toContain("app.user_id");
    });

    it("should verify app.user_id applies inside nested runWithUserContext", async () => {
      const outerReservedSql = createMockReservedSql();
      mockSqlClient.reserve.mockResolvedValueOnce(outerReservedSql);

      await service.runWithTenantContext("tenant-1", "mid-1", async () => {
        // At this point tenant_id and mid are set
        expect(outerReservedSql.configCalls).toContainEqual({
          key: "app.tenant_id",
          value: "tenant-1",
        });
        expect(outerReservedSql.configCalls).toContainEqual({
          key: "app.mid",
          value: "mid-1",
        });

        await service.runWithUserContext(
          "tenant-1",
          "mid-1",
          "user-123",
          async () => {
            // Now user_id should also be set on the SAME connection
            expect(outerReservedSql.configCalls).toContainEqual({
              key: "app.user_id",
              value: "user-123",
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

  describe("edge cases", () => {
    it("should handle error in nested callback gracefully", async () => {
      const outerReservedSql = createMockReservedSql();
      mockSqlClient.reserve.mockResolvedValueOnce(outerReservedSql);

      await expect(
        service.runWithTenantContext("t1", "m1", async () => {
          await service.runWithUserContext("t1", "m1", "u1", async () => {
            throw new Error("Nested error");
          });
        }),
      ).rejects.toThrow("Nested error");

      // Should still attempt to reset user_id even after error
      expect(outerReservedSql.resetCalls).toContain("app.user_id");
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
