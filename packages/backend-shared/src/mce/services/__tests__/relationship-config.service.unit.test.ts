import {
  createDataExtensionServiceStub,
  createDataFolderServiceStub,
  createMceBridgeStub,
} from "@qpp/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ErrorCode } from "../../../common/errors";
import { RelationshipConfigService } from "../relationship-config.service";

const T = "tenant-1";
const U = "user-1";
const M = "mid-1";

describe("RelationshipConfigService", () => {
  let service: RelationshipConfigService;
  let mceBridge: ReturnType<typeof createMceBridgeStub>;
  let dataExtensionService: ReturnType<typeof createDataExtensionServiceStub>;
  let dataFolderService: ReturnType<typeof createDataFolderServiceStub>;

  beforeEach(() => {
    vi.clearAllMocks();
    mceBridge = createMceBridgeStub();
    dataExtensionService = createDataExtensionServiceStub();
    dataFolderService = createDataFolderServiceStub();
    service = new RelationshipConfigService(
      mceBridge as unknown as ConstructorParameters<
        typeof RelationshipConfigService
      >[0],
      dataExtensionService as unknown as ConstructorParameters<
        typeof RelationshipConfigService
      >[1],
      dataFolderService as unknown as ConstructorParameters<
        typeof RelationshipConfigService
      >[2],
    );
  });

  describe("ensureConfigDE", () => {
    it("returns early without creating when config DE already exists", async () => {
      dataExtensionService.retrieveByCustomerKey.mockResolvedValue({
        name: "QPP_RelationshipConfig",
      });

      await service.ensureConfigDE(T, U, M);

      expect(dataExtensionService.retrieveByCustomerKey).toHaveBeenCalledWith(
        T,
        U,
        M,
        "QPP_RelationshipConfig",
      );
      expect(dataExtensionService.create).not.toHaveBeenCalled();
    });

    it("creates DE with 3 fields when config DE does not exist", async () => {
      dataExtensionService.retrieveByCustomerKey.mockResolvedValue(null);
      dataFolderService.retrieve.mockResolvedValue([{ id: 100 }]);
      dataExtensionService.create.mockResolvedValue(undefined);

      await service.ensureConfigDE(T, U, M);

      expect(dataExtensionService.create).toHaveBeenCalledWith(T, U, M, {
        name: "QPP_RelationshipConfig",
        customerKey: "QPP_RelationshipConfig",
        categoryId: 100,
        fields: [
          expect.objectContaining({ name: "RuleID", isPrimaryKey: true }),
          expect.objectContaining({ name: "RuleType" }),
          expect.objectContaining({ name: "Payload", maxLength: 4000 }),
        ],
      });
    });

    it("creates QPP Results folder when it does not exist", async () => {
      dataExtensionService.retrieveByCustomerKey.mockResolvedValue(null);
      dataFolderService.retrieve
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 1 }]);
      dataFolderService.create.mockResolvedValue({ id: 200 });
      dataExtensionService.create.mockResolvedValue(undefined);

      await service.ensureConfigDE(T, U, M);

      expect(dataFolderService.create).toHaveBeenCalledWith(T, U, M, {
        name: "QueryPlusPlus Results",
        parentFolderId: 1,
        contentType: "dataextension",
      });
      expect(dataExtensionService.create).toHaveBeenCalledWith(
        T,
        U,
        M,
        expect.objectContaining({ categoryId: 200 }),
      );
    });

    it("throws MCE_BAD_REQUEST when root DE folder is not found", async () => {
      dataExtensionService.retrieveByCustomerKey.mockResolvedValue(null);
      dataFolderService.retrieve.mockResolvedValue([]);

      await expect(service.ensureConfigDE(T, U, M)).rejects.toMatchObject({
        code: ErrorCode.MCE_BAD_REQUEST,
      });
    });
  });

  describe("getRules", () => {
    it("parses rowset response into rule objects", async () => {
      mceBridge.request.mockResolvedValue({
        items: [
          {
            keys: { RuleID: "r1" },
            values: { RuleType: "explicit_link", Payload: '{"foo":"bar"}' },
          },
          {
            keys: { ruleid: "r2" },
            values: { ruletype: "exclusion", payload: '{"baz":1}' },
          },
        ],
      });

      const rules = await service.getRules(T, U, M);

      expect(rules).toEqual([
        { RuleID: "r1", RuleType: "explicit_link", Payload: '{"foo":"bar"}' },
        { RuleID: "r2", RuleType: "exclusion", Payload: '{"baz":1}' },
      ]);
    });

    it("returns empty array for empty rowset", async () => {
      mceBridge.request.mockResolvedValue({ items: [] });

      const rules = await service.getRules(T, U, M);

      expect(rules).toEqual([]);
    });

    it("returns empty array when response has no items", async () => {
      mceBridge.request.mockResolvedValue({});

      const rules = await service.getRules(T, U, M);

      expect(rules).toEqual([]);
    });

    it("swallows RESOURCE_NOT_FOUND and returns empty array", async () => {
      mceBridge.request.mockRejectedValue(
        new AppError(ErrorCode.RESOURCE_NOT_FOUND),
      );

      const rules = await service.getRules(T, U, M);

      expect(rules).toEqual([]);
    });

    it("swallows MCE_BAD_REQUEST and returns empty array", async () => {
      mceBridge.request.mockRejectedValue(
        new AppError(ErrorCode.MCE_BAD_REQUEST),
      );

      const rules = await service.getRules(T, U, M);

      expect(rules).toEqual([]);
    });

    it("rethrows other errors", async () => {
      mceBridge.request.mockRejectedValue(new Error("network failure"));

      await expect(service.getRules(T, U, M)).rejects.toThrow(
        "network failure",
      );
    });
  });

  describe("upsertRule", () => {
    it("sends correct rowset upsert payload", async () => {
      mceBridge.request.mockResolvedValue(undefined);

      await service.upsertRule(T, U, M, {
        RuleID: "r1",
        RuleType: "explicit_link",
        Payload: '{"sourceDE":"A"}',
      });

      expect(mceBridge.request).toHaveBeenCalledWith(
        T,
        U,
        M,
        {
          method: "POST",
          url: "/hub/v1/dataevents/key:QPP_RelationshipConfig/rowset",
          data: [
            {
              keys: { RuleID: "r1" },
              values: {
                RuleType: "explicit_link",
                Payload: '{"sourceDE":"A"}',
              },
            },
          ],
        },
        expect.any(Number),
      );
    });
  });

  describe("deleteRule", () => {
    it("calls correct MCE endpoint with ruleId path", async () => {
      mceBridge.request.mockResolvedValue(undefined);

      await service.deleteRule(T, U, M, "r1");

      expect(mceBridge.request).toHaveBeenCalledWith(
        T,
        U,
        M,
        {
          method: "DELETE",
          url: "/hub/v1/dataevents/key:QPP_RelationshipConfig/rows/RuleID:r1",
        },
        expect.any(Number),
      );
    });
  });
});
