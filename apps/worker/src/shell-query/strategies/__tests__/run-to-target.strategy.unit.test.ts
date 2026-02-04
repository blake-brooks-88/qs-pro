/**
 * Run-to-Target Strategy Unit Tests
 *
 * Tests the RunToTargetFlow strategy which orchestrates MCE operations
 * for shell query execution when writing results to an existing Data Extension.
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
import { RunToTargetFlow } from "../run-to-target.strategy";

let jobCounter = 0;
function createTestJob(overrides: Partial<ShellQueryJob> = {}): ShellQueryJob {
  jobCounter++;
  return {
    runId: `run-target-test-${jobCounter}`,
    tenantId: "tenant-1",
    userId: "user-1",
    mid: "mid-1",
    eid: "eid-1",
    sqlText: "SELECT SubscriberKey FROM _Subscribers",
    targetDeCustomerKey: "TargetDEKey",
    snippetName: "Test Query",
    ...overrides,
  };
}

describe("RunToTargetFlow", () => {
  let flow: RunToTargetFlow;
  let queryValidatorMock: { validateQuery: ReturnType<typeof vi.fn> };
  let rlsContextStub: RlsContextStub;
  let dbStub: DbStub;
  let dataExtensionServiceStub: DataExtensionServiceStub;
  let dataFolderServiceStub: DataFolderServiceStub;
  let queryDefinitionServiceStub: QueryDefinitionServiceStub;

  beforeEach(async () => {
    queryValidatorMock = {
      validateQuery: vi.fn().mockResolvedValue({ valid: true }),
    };

    rlsContextStub = createRlsContextStub();
    dbStub = createDbStub();
    dataExtensionServiceStub = createDataExtensionServiceStub();
    dataFolderServiceStub = createDataFolderServiceStub();
    queryDefinitionServiceStub = createQueryDefinitionServiceStub();

    dbStub.setSelectResult([{ qppFolderId: 123 }]);

    dataExtensionServiceStub.retrieveByCustomerKey.mockResolvedValue({
      name: "Target DE",
      customerKey: "TargetDEKey",
      objectId: "de-obj-target",
    });
    dataExtensionServiceStub.retrieveFields.mockResolvedValue([
      {
        name: "EmailAddress",
        fieldType: "EmailAddress",
        maxLength: 254,
        isPrimaryKey: false,
        isRequired: false,
      },
    ]);
    queryDefinitionServiceStub.create.mockResolvedValue({
      objectId: "qd-created-123",
    });
    queryDefinitionServiceStub.perform.mockResolvedValue({
      taskId: "task-created-123",
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunToTargetFlow,
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

    flow = module.get<RunToTargetFlow>(RunToTargetFlow);
  });

  describe("execute()", () => {
    it("requires targetDeCustomerKey", async () => {
      const job = createTestJob({
        targetDeCustomerKey: undefined,
      });

      await expect(flow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
      });
    });

    it("throws RESOURCE_NOT_FOUND when target DE does not exist", async () => {
      dataExtensionServiceStub.retrieveByCustomerKey.mockResolvedValueOnce(
        null,
      );

      const job = createTestJob({
        targetDeCustomerKey: "MissingDEKey",
      });

      await expect(flow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it("blocks overwrite when the query reads from the target DE by name", async () => {
      const job = createTestJob({
        sqlText: "SELECT SubscriberKey FROM [Target DE]",
      });

      await expect(flow.execute(job)).rejects.toThrow(AppError);
      await expect(flow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.MCE_BAD_REQUEST,
      });

      expect(queryDefinitionServiceStub.create).not.toHaveBeenCalled();
      expect(queryDefinitionServiceStub.perform).not.toHaveBeenCalled();
    });

    it("blocks overwrite when the query reads from the target DE by customer key", async () => {
      const job = createTestJob({
        sqlText: "SELECT SubscriberKey FROM TargetDEKey",
      });

      await expect(flow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.MCE_BAD_REQUEST,
      });
      expect(queryDefinitionServiceStub.create).not.toHaveBeenCalled();
    });

    it("executes when the query does not reference the target DE", async () => {
      const job = createTestJob({
        sqlText: "SELECT EmailAddress FROM [Source DE]",
        tableMetadata: {
          "Source DE": [
            { Name: "EmailAddress", FieldType: "EmailAddress", MaxLength: 254 },
          ],
        },
      });

      const result = await flow.execute(job);

      expect(result).toEqual({
        status: "ready",
        taskId: "task-created-123",
        queryDefinitionId: "qd-created-123",
        queryCustomerKey: expect.stringContaining("QPP_Query_"),
        targetDeCustomerKey: "TargetDEKey",
      });
      expect(queryDefinitionServiceStub.create).toHaveBeenCalledTimes(1);
      expect(queryDefinitionServiceStub.perform).toHaveBeenCalledTimes(1);
    });

    it("fails fast when query output columns do not match target DE fields", async () => {
      const job = createTestJob({
        sqlText: "SELECT ms.Email FROM [Master_Subscriber] AS ms",
        tableMetadata: {
          Master_Subscriber: [
            { Name: "EmailAddress", FieldType: "EmailAddress", MaxLength: 254 },
          ],
        },
      });

      await expect(flow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.MCE_VALIDATION_FAILED,
      });
      expect(queryDefinitionServiceStub.create).not.toHaveBeenCalled();
      expect(queryDefinitionServiceStub.perform).not.toHaveBeenCalled();
    });
  });
});
