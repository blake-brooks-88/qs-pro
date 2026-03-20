import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ErrorCode } from "../../../common/errors";
import { RelationshipConfigService } from "../relationship-config.service";

const mockRequest = vi.fn();
const mockMceBridge = {
  request: mockRequest,
} as unknown as ConstructorParameters<typeof RelationshipConfigService>[0];

const mockRetrieveByCustomerKey = vi.fn();
const mockCreate = vi.fn();
const mockDataExtensionService = {
  retrieveByCustomerKey: mockRetrieveByCustomerKey,
  create: mockCreate,
} as unknown as ConstructorParameters<typeof RelationshipConfigService>[1];

const mockFolderRetrieve = vi.fn();
const mockFolderCreate = vi.fn();
const mockDataFolderService = {
  retrieve: mockFolderRetrieve,
  create: mockFolderCreate,
} as unknown as ConstructorParameters<typeof RelationshipConfigService>[2];

const T = "tenant-1";
const U = "user-1";
const M = "mid-1";

describe("RelationshipConfigService", () => {
  let service: RelationshipConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RelationshipConfigService(
      mockMceBridge,
      mockDataExtensionService,
      mockDataFolderService,
    );
  });

  describe("ensureConfigDE", () => {
    it("returns early without creating when config DE already exists", async () => {
      mockRetrieveByCustomerKey.mockResolvedValue({
        name: "QPP_RelationshipConfig",
      });

      await service.ensureConfigDE(T, U, M);

      expect(mockRetrieveByCustomerKey).toHaveBeenCalledWith(
        T,
        U,
        M,
        "QPP_RelationshipConfig",
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("creates DE with 3 fields when config DE does not exist", async () => {
      mockRetrieveByCustomerKey.mockResolvedValue(null);
      mockFolderRetrieve.mockResolvedValue([{ id: 100 }]);
      mockCreate.mockResolvedValue(undefined);

      await service.ensureConfigDE(T, U, M);

      expect(mockCreate).toHaveBeenCalledWith(T, U, M, {
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
      mockRetrieveByCustomerKey.mockResolvedValue(null);
      // First call: QPP Results folder not found; second call: root DE folder found
      mockFolderRetrieve
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 1 }]);
      mockFolderCreate.mockResolvedValue({ id: 200 });
      mockCreate.mockResolvedValue(undefined);

      await service.ensureConfigDE(T, U, M);

      expect(mockFolderCreate).toHaveBeenCalledWith(T, U, M, {
        name: "QueryPlusPlus Results",
        parentFolderId: 1,
        contentType: "dataextension",
      });
      expect(mockCreate).toHaveBeenCalledWith(
        T,
        U,
        M,
        expect.objectContaining({ categoryId: 200 }),
      );
    });

    it("throws when root DE folder is not found", async () => {
      mockRetrieveByCustomerKey.mockResolvedValue(null);
      mockFolderRetrieve.mockResolvedValue([]);

      await expect(service.ensureConfigDE(T, U, M)).rejects.toThrow(AppError);
    });
  });

  describe("getRules", () => {
    it("parses rowset response into rule objects", async () => {
      mockRequest.mockResolvedValue({
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
      mockRequest.mockResolvedValue({ items: [] });

      const rules = await service.getRules(T, U, M);

      expect(rules).toEqual([]);
    });

    it("returns empty array when response has no items", async () => {
      mockRequest.mockResolvedValue({});

      const rules = await service.getRules(T, U, M);

      expect(rules).toEqual([]);
    });

    it("swallows RESOURCE_NOT_FOUND and returns empty array", async () => {
      mockRequest.mockRejectedValue(new AppError(ErrorCode.RESOURCE_NOT_FOUND));

      const rules = await service.getRules(T, U, M);

      expect(rules).toEqual([]);
    });

    it("swallows MCE_BAD_REQUEST and returns empty array", async () => {
      mockRequest.mockRejectedValue(new AppError(ErrorCode.MCE_BAD_REQUEST));

      const rules = await service.getRules(T, U, M);

      expect(rules).toEqual([]);
    });

    it("rethrows other errors", async () => {
      mockRequest.mockRejectedValue(new Error("network failure"));

      await expect(service.getRules(T, U, M)).rejects.toThrow(
        "network failure",
      );
    });
  });

  describe("upsertRule", () => {
    it("sends correct rowset upsert payload", async () => {
      mockRequest.mockResolvedValue(undefined);

      await service.upsertRule(T, U, M, {
        RuleID: "r1",
        RuleType: "explicit_link",
        Payload: '{"sourceDE":"A"}',
      });

      expect(mockRequest).toHaveBeenCalledWith(
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
      mockRequest.mockResolvedValue(undefined);

      await service.deleteRule(T, U, M, "r1");

      expect(mockRequest).toHaveBeenCalledWith(
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
