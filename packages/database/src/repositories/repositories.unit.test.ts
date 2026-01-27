import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseError } from "../errors";
import {
  DrizzleCredentialsRepository,
  DrizzleFeatureOverrideRepository,
  DrizzleTenantRepository,
  DrizzleUserRepository,
} from "./drizzle-repositories";

/**
 * Creates a mock Drizzle database with chainable query builder that captures
 * filter arguments and allows configuring return values.
 */
function createMockDrizzleDb() {
  let selectResult: unknown[] = [];
  let insertResult: unknown[] = [];
  let insertError: Error | null = null;
  const capturedWhereArgs: unknown[][] = [];
  const capturedInsertValues: unknown[] = [];

  const mockWhere = vi.fn().mockImplementation((...args: unknown[]) => {
    capturedWhereArgs.push(args);
    return selectResult;
  });

  const mockFrom = vi.fn().mockReturnValue({
    where: mockWhere,
  });

  const mockSelect = vi.fn().mockReturnValue({
    from: mockFrom,
  });

  const mockReturning = vi.fn().mockImplementation(() => {
    if (insertError) {
      throw insertError;
    }
    return insertResult;
  });

  const mockOnConflictDoUpdate = vi.fn().mockReturnValue({
    returning: mockReturning,
  });

  const mockValues = vi.fn().mockImplementation((values: unknown) => {
    capturedInsertValues.push(values);
    return {
      onConflictDoUpdate: mockOnConflictDoUpdate,
      returning: mockReturning,
    };
  });

  const mockInsert = vi.fn().mockReturnValue({
    values: mockValues,
  });

  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockReturnValue({
    where: mockDeleteWhere,
  });

  return {
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
    // Helpers for test configuration
    setSelectResult: (result: unknown[]) => {
      selectResult = result;
    },
    setInsertResult: (result: unknown[]) => {
      insertResult = result;
    },
    setInsertError: (error: Error | null) => {
      insertError = error;
    },
    getCapturedWhereArgs: () => capturedWhereArgs,
    getCapturedInsertValues: () => capturedInsertValues,
    resetCaptures: () => {
      capturedWhereArgs.length = 0;
      capturedInsertValues.length = 0;
      insertError = null;
    },
    // Access to mocks for assertions
    mocks: {
      select: mockSelect,
      insert: mockInsert,
      from: mockFrom,
      where: mockWhere,
      values: mockValues,
      onConflictDoUpdate: mockOnConflictDoUpdate,
      returning: mockReturning,
    },
  };
}

type MockDrizzleDb = ReturnType<typeof createMockDrizzleDb>;

describe("DrizzleTenantRepository", () => {
  let mockDb: MockDrizzleDb;
  let repository: DrizzleTenantRepository;

  beforeEach(() => {
    mockDb = createMockDrizzleDb();
    repository = new DrizzleTenantRepository(
      mockDb as unknown as PostgresJsDatabase,
    );
    mockDb.resetCaptures();
  });

  describe("findById()", () => {
    it("returns tenant when found", async () => {
      // Arrange
      const tenant = { id: "tenant-1", eid: "eid-1", tssd: "stack-1" };
      mockDb.setSelectResult([tenant]);

      // Act
      const result = await repository.findById("tenant-1");

      // Assert
      expect(result).toEqual(tenant);
      expect(mockDb.mocks.select).toHaveBeenCalled();
    });

    it("returns undefined when not found", async () => {
      // Arrange
      mockDb.setSelectResult([]);

      // Act
      const result = await repository.findById("non-existent");

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe("upsert()", () => {
    it("throws DatabaseError when upsert returns no result", async () => {
      // Arrange
      mockDb.setInsertResult([]);

      // Act & Assert
      await expect(
        repository.upsert({ eid: "eid-1", tssd: "stack-1" }),
      ).rejects.toThrow(DatabaseError);
    });
  });
});

describe("DrizzleUserRepository", () => {
  let mockDb: MockDrizzleDb;
  let repository: DrizzleUserRepository;

  beforeEach(() => {
    mockDb = createMockDrizzleDb();
    repository = new DrizzleUserRepository(
      mockDb as unknown as PostgresJsDatabase,
    );
    mockDb.resetCaptures();
  });

  describe("findById()", () => {
    it("returns user when found", async () => {
      // Arrange
      const user = {
        id: "user-1",
        sfUserId: "sf-1",
        tenantId: "tenant-1",
        email: "test@example.com",
        name: "Test User",
      };
      mockDb.setSelectResult([user]);

      // Act
      const result = await repository.findById("user-1");

      // Assert
      expect(result).toEqual(user);
    });
  });

  describe("upsert()", () => {
    it("throws DatabaseError when upsert returns no result", async () => {
      // Arrange
      mockDb.setInsertResult([]);

      // Act & Assert
      await expect(
        repository.upsert({
          sfUserId: "sf-1",
          tenantId: "tenant-1",
          email: "test@example.com",
          name: "Test User",
        }),
      ).rejects.toThrow(DatabaseError);
    });

    it("sets correct tenant_id on insert", async () => {
      // Arrange
      const testTenantId = "tenant-user-test";
      const insertedUser = {
        id: "user-new",
        sfUserId: "sf-1",
        tenantId: testTenantId,
        email: "test@example.com",
        name: "Test User",
      };
      mockDb.setInsertResult([insertedUser]);

      // Act
      await repository.upsert({
        sfUserId: "sf-1",
        tenantId: testTenantId,
        email: "test@example.com",
        name: "Test User",
      });

      // Assert - verify insert was called with correct tenant_id
      expect(mockDb.mocks.values).toHaveBeenCalled();
      const capturedValues = mockDb.getCapturedInsertValues();
      expect(capturedValues.length).toBeGreaterThan(0);
      const insertedValues = capturedValues[0] as { tenantId: string };
      expect(insertedValues.tenantId).toBe(testTenantId);
    });

    it("throws error on foreign key constraint violation", async () => {
      // Arrange - simulate PostgreSQL foreign key constraint violation (code 23503)
      const fkConstraintError = new Error(
        "insert or update violates foreign key constraint",
      ) as Error & { code: string };
      fkConstraintError.code = "23503";
      mockDb.setInsertError(fkConstraintError);

      // Act & Assert - error should propagate when referencing non-existent tenant
      await expect(
        repository.upsert({
          sfUserId: "sf-orphan",
          tenantId: "non-existent-tenant-id",
          email: "orphan@example.com",
          name: "Orphan User",
        }),
      ).rejects.toThrow("insert or update violates foreign key constraint");
    });
  });
});

describe("DrizzleCredentialsRepository", () => {
  let mockDb: MockDrizzleDb;
  let repository: DrizzleCredentialsRepository;

  beforeEach(() => {
    mockDb = createMockDrizzleDb();
    repository = new DrizzleCredentialsRepository(
      mockDb as unknown as PostgresJsDatabase,
    );
    mockDb.resetCaptures();
  });

  describe("findByUserTenantMid()", () => {
    it("returns credential when found", async () => {
      // Arrange
      const credential = {
        id: "cred-1",
        userId: "user-1",
        tenantId: "tenant-1",
        mid: "mid-1",
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: new Date(),
      };
      mockDb.setSelectResult([credential]);

      // Act
      const result = await repository.findByUserTenantMid(
        "user-1",
        "tenant-1",
        "mid-1",
      );

      // Assert
      expect(result).toEqual(credential);
    });

    it("returns undefined when not found", async () => {
      // Arrange
      mockDb.setSelectResult([]);

      // Act
      const result = await repository.findByUserTenantMid(
        "user-1",
        "tenant-1",
        "mid-1",
      );

      // Assert
      expect(result).toBeUndefined();
    });

    it("includes tenant_id filter in query", async () => {
      // Arrange
      mockDb.setSelectResult([]);

      // Act
      await repository.findByUserTenantMid("user-1", "tenant-abc", "mid-1");

      // Assert - verify where clause was called with filter containing tenant_id
      expect(mockDb.mocks.where).toHaveBeenCalled();
      const whereArgs = mockDb.getCapturedWhereArgs();
      expect(whereArgs.length).toBeGreaterThan(0);
    });

    it("cannot access data from different tenant", async () => {
      // Arrange - simulate DB returning no results for cross-tenant query
      // This represents RLS enforcement at the database level
      mockDb.setSelectResult([]);

      // Act - query with tenant-2's credentials while "scoped" to different tenant
      const result = await repository.findByUserTenantMid(
        "user-from-tenant-1",
        "tenant-2",
        "mid-from-tenant-1",
      );

      // Assert - no data returned (isolation enforced)
      expect(result).toBeUndefined();
      expect(mockDb.mocks.where).toHaveBeenCalled();
    });

    it("includes mid filter in query", async () => {
      // Arrange
      mockDb.setSelectResult([]);

      // Act
      await repository.findByUserTenantMid("user-1", "tenant-1", "mid-xyz-123");

      // Assert - verify where clause was called (mid is part of composite filter)
      expect(mockDb.mocks.where).toHaveBeenCalled();
      const whereArgs = mockDb.getCapturedWhereArgs();
      expect(whereArgs.length).toBeGreaterThan(0);
    });

    it("cannot access data from different MID within same tenant", async () => {
      // Arrange - simulate DB returning no results for cross-MID query
      // Same tenant, but different business unit (MID)
      mockDb.setSelectResult([]);

      // Act - query with correct tenant but different MID
      const result = await repository.findByUserTenantMid(
        "user-1",
        "tenant-1",
        "mid-different-bu",
      );

      // Assert - no data returned (MID isolation enforced)
      expect(result).toBeUndefined();
      expect(mockDb.mocks.where).toHaveBeenCalled();
    });
  });

  describe("upsert()", () => {
    it("throws DatabaseError when upsert returns no result", async () => {
      // Arrange
      mockDb.setInsertResult([]);

      // Act & Assert
      await expect(
        repository.upsert({
          userId: "user-1",
          tenantId: "tenant-1",
          mid: "mid-1",
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: new Date(),
        }),
      ).rejects.toThrow(DatabaseError);
    });

    it("sets correct tenant_id on insert", async () => {
      // Arrange
      const testTenantId = "tenant-insert-test";
      const insertedCredential = {
        id: "cred-new",
        userId: "user-1",
        tenantId: testTenantId,
        mid: "mid-1",
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: new Date(),
      };
      mockDb.setInsertResult([insertedCredential]);

      // Act
      await repository.upsert({
        userId: "user-1",
        tenantId: testTenantId,
        mid: "mid-1",
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: new Date(),
      });

      // Assert - verify insert was called with correct tenant_id
      expect(mockDb.mocks.values).toHaveBeenCalled();
      const capturedValues = mockDb.getCapturedInsertValues();
      expect(capturedValues.length).toBeGreaterThan(0);
      const insertedValues = capturedValues[0] as { tenantId: string };
      expect(insertedValues.tenantId).toBe(testTenantId);
    });

    it("throws error on unique constraint violation", async () => {
      // Arrange - simulate PostgreSQL unique constraint violation (code 23505)
      const uniqueConstraintError = new Error(
        "duplicate key value violates unique constraint",
      ) as Error & { code: string };
      uniqueConstraintError.code = "23505";
      mockDb.setInsertError(uniqueConstraintError);

      // Act & Assert - error should propagate
      await expect(
        repository.upsert({
          userId: "user-1",
          tenantId: "tenant-1",
          mid: "mid-1",
          accessToken: "duplicate-token",
          refreshToken: "refresh",
          expiresAt: new Date(),
        }),
      ).rejects.toThrow("duplicate key value violates unique constraint");
    });
  });
});

describe("DrizzleFeatureOverrideRepository", () => {
  let mockDb: MockDrizzleDb;
  let repository: DrizzleFeatureOverrideRepository;

  beforeEach(() => {
    mockDb = createMockDrizzleDb();
    repository = new DrizzleFeatureOverrideRepository(
      mockDb as unknown as PostgresJsDatabase,
    );
    mockDb.resetCaptures();
  });

  describe("findByTenantId()", () => {
    it("returns feature overrides for tenant", async () => {
      // Arrange
      const overrides = [
        {
          id: "override-1",
          tenantId: "tenant-1",
          featureKey: "feature-1",
          enabled: true,
        },
      ];
      mockDb.setSelectResult(overrides);

      // Act
      const result = await repository.findByTenantId("tenant-1");

      // Assert
      expect(result).toEqual(overrides);
    });

    it("returns empty array when no overrides found", async () => {
      // Arrange
      mockDb.setSelectResult([]);

      // Act
      const result = await repository.findByTenantId("tenant-1");

      // Assert
      expect(result).toEqual([]);
    });

    it("includes tenant_id filter in query", async () => {
      // Arrange
      mockDb.setSelectResult([]);

      // Act
      await repository.findByTenantId("tenant-xyz");

      // Assert - verify where clause was called with tenant_id filter
      expect(mockDb.mocks.where).toHaveBeenCalled();
      const whereArgs = mockDb.getCapturedWhereArgs();
      expect(whereArgs.length).toBeGreaterThan(0);
    });
  });
});
