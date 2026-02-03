/**
 * Run-to-Temp Strategy Unit Tests
 *
 * Tests the RunToTempFlow strategy which orchestrates MCE operations
 * for shell query execution including DataExtension and QueryDefinition management.
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  AppError,
  DataExtensionService,
  DataFolderService,
  ErrorCode,
  QueryDefinitionService,
  RlsContextService,
} from "@qpp/backend-shared";
import {
  createDataExtensionServiceStub,
  createDataFolderServiceStub,
  createDbStub,
  createQueryDefinitionServiceStub,
  createRlsContextStub,
  type DataExtensionServiceStub,
  type DataFolderServiceStub,
  type DbStub,
  type QueryDefinitionServiceStub,
  type RlsContextStub,
} from "@qpp/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MceQueryValidator } from "../../mce-query-validator";
import type { ShellQueryJob } from "../../shell-query.types";
import { RunToTempFlow } from "../run-to-temp.strategy";

let jobCounter = 0;
function createTestJob(overrides: Partial<ShellQueryJob> = {}): ShellQueryJob {
  jobCounter++;
  return {
    runId: `run-test-${jobCounter}`,
    tenantId: "tenant-1",
    userId: "user-1",
    mid: "mid-1",
    eid: "eid-1",
    sqlText: "SELECT SubscriberKey FROM _Subscribers",
    snippetName: "Test Query",
    ...overrides,
  };
}

describe("RunToTempFlow", () => {
  let flow: RunToTempFlow;
  let queryValidatorMock: {
    validateQuery: ReturnType<typeof vi.fn>;
  };
  let rlsContextStub: RlsContextStub;
  let dbStub: DbStub;
  let dataExtensionServiceStub: DataExtensionServiceStub & {
    delete: ReturnType<typeof vi.fn>;
  };
  let dataFolderServiceStub: DataFolderServiceStub;
  let queryDefinitionServiceStub: QueryDefinitionServiceStub;

  beforeEach(async () => {
    queryValidatorMock = {
      validateQuery: vi.fn().mockResolvedValue({ valid: true }),
    };

    rlsContextStub = createRlsContextStub();
    dbStub = createDbStub();
    dataExtensionServiceStub = {
      ...createDataExtensionServiceStub(),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    dataFolderServiceStub = createDataFolderServiceStub();
    queryDefinitionServiceStub = createQueryDefinitionServiceStub();

    // Default: tenant settings with qppFolderId
    dbStub.setSelectResult([{ qppFolderId: 123 }]);

    // Setup stubs with default successful responses
    dataExtensionServiceStub.create.mockResolvedValue({
      objectId: "de-created-123",
    });
    queryDefinitionServiceStub.create.mockResolvedValue({
      objectId: "qd-created-123",
    });
    queryDefinitionServiceStub.perform.mockResolvedValue({
      taskId: "task-created-123",
    });
    dataExtensionServiceStub.retrieveFields.mockResolvedValue([
      { name: "SubscriberKey", fieldType: "Text", maxLength: 254 },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunToTempFlow,
        { provide: MceQueryValidator, useValue: queryValidatorMock },
        { provide: RlsContextService, useValue: rlsContextStub },
        { provide: "DATABASE", useValue: dbStub },
        { provide: DataExtensionService, useValue: dataExtensionServiceStub },
        { provide: DataFolderService, useValue: dataFolderServiceStub },
        {
          provide: QueryDefinitionService,
          useValue: queryDefinitionServiceStub,
        },
      ],
    }).compile();

    flow = module.get<RunToTempFlow>(RunToTempFlow);
  });

  describe("execute() - Full Flow", () => {
    it("validates query before creating any resources", async () => {
      // Arrange
      const job = createTestJob({
        sqlText: "SELECT SubscriberKey FROM _Subscribers",
      });
      queryValidatorMock.validateQuery.mockResolvedValue({ valid: true });

      // Act
      await flow.execute(job);

      // Assert
      expect(queryValidatorMock.validateQuery).toHaveBeenCalledWith(
        "SELECT SubscriberKey FROM _Subscribers",
        expect.objectContaining({
          tenantId: job.tenantId,
          userId: job.userId,
          mid: job.mid,
        }),
      );
      expect(queryValidatorMock.validateQuery).toHaveBeenCalledBefore(
        dataExtensionServiceStub.create,
      );
    });

    it("throws validation error when query is invalid", async () => {
      // Arrange
      const job = createTestJob({ sqlText: "INVALID SQL" });
      queryValidatorMock.validateQuery.mockResolvedValue({
        valid: false,
        errors: ["Syntax error"],
      });

      // Act & Assert
      await expect(flow.execute(job)).rejects.toThrow(AppError);
      await expect(flow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.MCE_VALIDATION_FAILED,
      });
    });

    it("expands SELECT * queries using metadata fetcher", async () => {
      // Arrange
      const job = createTestJob({
        sqlText: "SELECT * FROM TestDE",
        tableMetadata: {
          TestDE: [
            { Name: "EmailAddress", FieldType: "EmailAddress", MaxLength: 254 },
            { Name: "FirstName", FieldType: "Text", MaxLength: 50 },
          ],
        },
      });

      // Act
      await flow.execute(job);

      // Assert - The expanded SQL should be used (not SELECT *)
      expect(queryDefinitionServiceStub.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          queryText: expect.not.stringContaining("*"),
        }),
      );
    });

    it("returns complete FlowResult with all required IDs", async () => {
      // Arrange - use no snippetName to get QPP_Results_ prefix
      const job = createTestJob({
        runId: "run-flow-test",
        sqlText: "SELECT SubscriberKey FROM _Subscribers",
        snippetName: undefined,
      });

      // Act
      const result = await flow.execute(job);

      // Assert
      expect(result).toEqual({
        status: "ready",
        taskId: "task-created-123",
        queryDefinitionId: "qd-created-123",
        queryCustomerKey: expect.stringContaining("QPP_Query_"),
        targetDeCustomerKey: expect.stringContaining("QPP_Results_"),
      });
    });

    it("publishes status at each step of execution", async () => {
      // Arrange
      const job = createTestJob({
        sqlText: "SELECT SubscriberKey FROM _Subscribers",
      });
      const statusPublisher = vi.fn();

      // Act
      await flow.execute(job, statusPublisher);

      // Assert
      expect(statusPublisher).toHaveBeenCalledWith("validating_query");
      expect(statusPublisher).toHaveBeenCalledWith("creating_data_extension");
      expect(statusPublisher).toHaveBeenCalledWith("executing_query");
    });
  });

  describe("DataExtension Lifecycle", () => {
    it("creates DE with inferred schema fields", async () => {
      // Arrange
      const job = createTestJob({
        sqlText: "SELECT EmailAddress, FirstName FROM TestDE",
        tableMetadata: {
          TestDE: [
            { Name: "EmailAddress", FieldType: "EmailAddress", MaxLength: 254 },
            { Name: "FirstName", FieldType: "Text", MaxLength: 50 },
          ],
        },
      });

      // Act
      await flow.execute(job);

      // Assert
      expect(dataExtensionServiceStub.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          retention: {
            type: "period",
            periodLength: 1,
            periodUnit: "Days",
            deleteType: "all",
            resetOnImport: false,
            deleteAtEnd: true,
          },
          fields: expect.arrayContaining([
            expect.objectContaining({ name: "EmailAddress" }),
            expect.objectContaining({ name: "FirstName" }),
          ]),
        }),
      );
    });

    it("throws error when SELECT * expansion fails due to missing metadata", async () => {
      // Arrange - SELECT * requires metadata to expand, but table is unknown
      const job = createTestJob({
        sqlText: "SELECT * FROM UnknownTable",
        tableMetadata: undefined,
      });
      // Mock metadata retrieval to return empty (table not found)
      dataExtensionServiceStub.retrieveFields.mockResolvedValue([]);

      // Act & Assert - SELECT * expansion fails when no metadata available
      await expect(flow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.SELECT_STAR_EXPANSION_FAILED,
      });
    });

    it("deletes existing DE before creating new one", async () => {
      // Arrange
      const job = createTestJob({
        runId: "run-de-delete",
        sqlText: "SELECT SubscriberKey FROM _Subscribers",
      });

      // Mock delete to succeed (existing DE found)
      dataExtensionServiceStub.delete = vi.fn().mockResolvedValue(undefined);

      // Act
      await flow.execute(job);

      // Assert
      expect(dataExtensionServiceStub.delete).toHaveBeenCalled();
      expect(dataExtensionServiceStub.create).toHaveBeenCalled();
    });

    it("handles DE deletion failure gracefully and continues", async () => {
      // Arrange
      const job = createTestJob({
        runId: "run-de-fail",
        sqlText: "SELECT SubscriberKey FROM _Subscribers",
      });

      // Mock delete to fail (DE doesn't exist or other error)
      dataExtensionServiceStub.delete = vi
        .fn()
        .mockRejectedValue(new Error("DE not found"));

      // Act
      const result = await flow.execute(job);

      // Assert - should still succeed because deletion failure is non-fatal
      expect(result.status).toBe("ready");
      expect(dataExtensionServiceStub.create).toHaveBeenCalled();
    });
  });

  describe("QueryDefinition Lifecycle", () => {
    it("creates query definition with correct parameters", async () => {
      // Arrange
      const job = createTestJob({
        runId: "run-qd-create",
        sqlText: "SELECT SubscriberKey FROM _Subscribers",
      });

      // Act
      await flow.execute(job);

      // Assert
      expect(queryDefinitionServiceStub.create).toHaveBeenCalledWith(
        job.tenantId,
        job.userId,
        job.mid,
        expect.objectContaining({
          name: expect.stringContaining("QPP_Query_"),
          customerKey: expect.stringContaining("QPP_Query_"),
          queryText: "SELECT SubscriberKey FROM _Subscribers",
          targetId: "de-created-123",
        }),
      );
    });

    it("deletes existing query definition before creating new one", async () => {
      // Arrange
      const job = createTestJob({
        sqlText: "SELECT SubscriberKey FROM _Subscribers",
      });

      // Mock retrieve to return existing QD
      queryDefinitionServiceStub.retrieve.mockResolvedValue({
        objectId: "existing-qd-123",
      });

      // Act
      await flow.execute(job);

      // Assert
      expect(queryDefinitionServiceStub.delete).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        "existing-qd-123",
      );
    });

    it("handles query definition deletion failure gracefully", async () => {
      // Arrange
      const job = createTestJob({
        sqlText: "SELECT SubscriberKey FROM _Subscribers",
      });

      // Mock retrieve to return existing QD, but delete fails
      queryDefinitionServiceStub.retrieve.mockResolvedValue({
        objectId: "existing-qd-fail",
      });
      queryDefinitionServiceStub.delete.mockRejectedValue(
        new Error("Delete failed"),
      );

      // Act
      const result = await flow.execute(job);

      // Assert - should still succeed because deletion failure is non-fatal
      expect(result.status).toBe("ready");
    });

    it("retrieves query definition ObjectID by customer key", async () => {
      // Arrange
      queryDefinitionServiceStub.retrieve.mockResolvedValue({
        objectId: "retrieved-qd-456",
      });

      // Act
      const objectId = await flow.retrieveQueryDefinitionObjectId(
        "tenant-1",
        "user-1",
        "mid-1",
        "QPP_Query_user-1",
      );

      // Assert
      expect(objectId).toBe("retrieved-qd-456");
      expect(queryDefinitionServiceStub.retrieve).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "mid-1",
        "QPP_Query_user-1",
      );
    });
  });

  describe("Result Handling - Metadata Fetching", () => {
    it("uses provided tableMetadata when available", async () => {
      // Arrange
      const job = createTestJob({
        sqlText: "SELECT EmailAddress FROM TestDE",
        tableMetadata: {
          TestDE: [
            { Name: "EmailAddress", FieldType: "EmailAddress", MaxLength: 254 },
          ],
        },
      });

      // Act
      await flow.execute(job);

      // Assert - should NOT call MCE to fetch metadata
      expect(dataExtensionServiceStub.retrieveFields).not.toHaveBeenCalled();
    });

    it("fetches metadata from MCE when not provided and table is not a system data view", async () => {
      // Arrange - use a custom DE name (not a system data view)
      const job = createTestJob({
        sqlText: "SELECT EmailAddress FROM CustomContacts",
        tableMetadata: undefined,
      });
      // Mock metadata retrieval to return fields
      dataExtensionServiceStub.retrieveFields.mockResolvedValue([
        { name: "EmailAddress", fieldType: "EmailAddress", maxLength: 254 },
      ]);

      // Act
      await flow.execute(job);

      // Assert - should call MCE to fetch metadata for CustomContacts
      expect(dataExtensionServiceStub.retrieveFields).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        "CustomContacts",
      );
    });

    it("maps field types correctly for DE creation", async () => {
      // Arrange
      const job = createTestJob({
        sqlText: "SELECT EmailAddress, Age, IsActive, JoinDate FROM TestDE",
        tableMetadata: {
          TestDE: [
            { Name: "EmailAddress", FieldType: "EmailAddress", MaxLength: 254 },
            { Name: "Age", FieldType: "Number" },
            { Name: "IsActive", FieldType: "Boolean" },
            { Name: "JoinDate", FieldType: "Date" },
          ],
        },
      });

      // Act
      await flow.execute(job);

      // Assert
      expect(dataExtensionServiceStub.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          retention: {
            type: "period",
            periodLength: 1,
            periodUnit: "Days",
            deleteType: "all",
            resetOnImport: false,
            deleteAtEnd: true,
          },
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "EmailAddress",
              fieldType: "EmailAddress",
            }),
            expect.objectContaining({ name: "Age", fieldType: "Number" }),
            expect.objectContaining({ name: "IsActive", fieldType: "Boolean" }),
            expect.objectContaining({ name: "JoinDate", fieldType: "Date" }),
          ]),
        }),
      );
    });
  });

  describe("Cleanup Resilience", () => {
    it("logs warning but continues when DE deletion fails during cleanup", async () => {
      // Arrange
      const job = createTestJob({
        sqlText: "SELECT SubscriberKey FROM _Subscribers",
      });

      // Mock deletion to fail
      dataExtensionServiceStub.delete = vi
        .fn()
        .mockRejectedValue(new Error("Cleanup failed"));

      // Act - should not throw
      const result = await flow.execute(job);

      // Assert - execution succeeds despite cleanup failure
      expect(result.status).toBe("ready");
    });

    it("logs warning but continues when query definition deletion fails during cleanup", async () => {
      // Arrange
      const job = createTestJob({
        sqlText: "SELECT SubscriberKey FROM _Subscribers",
      });

      // Mock QD deletion to fail
      queryDefinitionServiceStub.retrieve.mockResolvedValue({
        objectId: "qd-to-delete",
      });
      queryDefinitionServiceStub.delete.mockRejectedValue(
        new Error("QD deletion failed"),
      );

      // Act - should not throw
      const result = await flow.execute(job);

      // Assert - execution succeeds despite cleanup failure
      expect(result.status).toBe("ready");
    });
  });
});
