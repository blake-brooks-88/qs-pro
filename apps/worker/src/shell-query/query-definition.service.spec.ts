import { Test, TestingModule } from "@nestjs/testing";
import { MceBridgeService } from "@qs-pro/backend-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueryDefinitionService } from "./query-definition.service";

function createDbStub() {
  const stub: {
    _selectResult: unknown[];
    select: ReturnType<typeof vi.fn>;
    setSelectResult: (result: unknown[]) => void;
  } = {
    _selectResult: [],
    select: vi.fn(),
    setSelectResult: (result: unknown[]) => {
      stub._selectResult = result;
    },
  };

  const whereResult = () => {
    const result = stub._selectResult;
    (result as unknown as { limit: ReturnType<typeof vi.fn> }).limit = vi.fn(
      () => stub._selectResult,
    );
    return result;
  };

  stub.select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(whereResult),
    })),
  }));

  return stub;
}

describe("QueryDefinitionService", () => {
  let service: QueryDefinitionService;
  let mockMceBridge: { soapRequest: ReturnType<typeof vi.fn> };
  let mockDb: ReturnType<typeof createDbStub>;

  const mockContext = {
    tenantId: "tenant-1",
    userId: "user-1",
    mid: "mid-1",
  };

  beforeEach(async () => {
    mockMceBridge = {
      soapRequest: vi.fn(),
    };
    mockDb = createDbStub();
    mockDb.setSelectResult([{ qppFolderId: 12345 }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryDefinitionService,
        { provide: MceBridgeService, useValue: mockMceBridge },
        { provide: "DATABASE", useValue: mockDb },
      ],
    }).compile();

    service = module.get<QueryDefinitionService>(QueryDefinitionService);
  });

  // SOAP call sequence:
  // 1) CustomerKey retrieve (always)
  // 2) Folder+key retrieve (only if CustomerKey not found AND folderId exists)
  // 3) Delete (only if ObjectID found)
  const emptyResponse = { Body: { RetrieveResponseMsg: {} } };

  describe("deleteByCustomerKey", () => {
    it("retrieves ObjectID and deletes by ObjectID when found by CustomerKey", async () => {
      // Arrange - CustomerKey retrieve succeeds
      mockMceBridge.soapRequest
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              Results: { ObjectID: "obj-123", CustomerKey: "QPP_Query_abc" },
            },
          },
        })
        .mockResolvedValueOnce({}); // delete

      // Act
      const result = await service.deleteByCustomerKey(
        mockContext.tenantId,
        mockContext.userId,
        mockContext.mid,
        "QPP_Query_abc",
      );

      // Assert - only 2 calls: retrieve + delete (no folder fallback needed)
      expect(result).toBe(true);
      expect(mockMceBridge.soapRequest).toHaveBeenCalledTimes(2);
    });

    it("retrieves ObjectID by folder+key when CustomerKey retrieve fails", async () => {
      // Arrange - CustomerKey not found, folder+key succeeds
      mockMceBridge.soapRequest
        .mockResolvedValueOnce(emptyResponse) // CustomerKey not found
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              Results: { ObjectID: "obj-456", CustomerKey: "QPP_Query_abc" },
            },
          },
        })
        .mockResolvedValueOnce({}); // delete

      // Act
      const result = await service.deleteByCustomerKey(
        mockContext.tenantId,
        mockContext.userId,
        mockContext.mid,
        "QPP_Query_abc",
      );

      // Assert - 3 calls: retrieve + folder-retrieve + delete
      expect(result).toBe(true);
      expect(mockMceBridge.soapRequest).toHaveBeenCalledTimes(3);

      // Delete uses ObjectID from folder+key retrieve
      expect(mockMceBridge.soapRequest).toHaveBeenNthCalledWith(
        3,
        mockContext.tenantId,
        mockContext.userId,
        mockContext.mid,
        expect.stringContaining("<ObjectID>obj-456</ObjectID>"),
        "Delete",
      );
    });

    it("handles array results from MCE (uses first result)", async () => {
      // Arrange
      mockMceBridge.soapRequest
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              Results: [
                { ObjectID: "obj-first", CustomerKey: "QPP_Query_abc" },
                { ObjectID: "obj-second", CustomerKey: "QPP_Query_def" },
              ],
            },
          },
        })
        .mockResolvedValueOnce({}); // delete

      // Act
      const result = await service.deleteByCustomerKey(
        mockContext.tenantId,
        mockContext.userId,
        mockContext.mid,
        "QPP_Query_abc",
      );

      // Assert
      expect(result).toBe(true);
      expect(mockMceBridge.soapRequest).toHaveBeenNthCalledWith(
        2,
        mockContext.tenantId,
        mockContext.userId,
        mockContext.mid,
        expect.stringContaining("<ObjectID>obj-first</ObjectID>"),
        "Delete",
      );
    });

    it("returns false when query not found by any method", async () => {
      // Arrange - both retrieves fail
      mockMceBridge.soapRequest
        .mockResolvedValueOnce(emptyResponse) // CustomerKey
        .mockResolvedValueOnce(emptyResponse); // folder+key

      // Act
      const result = await service.deleteByCustomerKey(
        mockContext.tenantId,
        mockContext.userId,
        mockContext.mid,
        "QPP_Query_nonexistent",
      );

      // Assert - 2 calls: retrieve + folder-retrieve (no delete)
      expect(result).toBe(false);
      expect(mockMceBridge.soapRequest).toHaveBeenCalledTimes(2);
    });

    it("returns false when query has no ObjectID from either method", async () => {
      // Arrange - results have no ObjectID
      mockMceBridge.soapRequest
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              Results: { CustomerKey: "QPP_Query_abc" },
            },
          },
        })
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              Results: { CustomerKey: "QPP_Query_abc" },
            },
          },
        });

      // Act
      const result = await service.deleteByCustomerKey(
        mockContext.tenantId,
        mockContext.userId,
        mockContext.mid,
        "QPP_Query_abc",
      );

      // Assert - 2 calls (first returns no ObjectID, so tries folder+key)
      expect(result).toBe(false);
      expect(mockMceBridge.soapRequest).toHaveBeenCalledTimes(2);
    });

    it("throws on first retrieve SOAP error", async () => {
      // Arrange
      mockMceBridge.soapRequest.mockRejectedValueOnce(
        new Error("SOAP retrieve failed"),
      );

      // Act & Assert
      await expect(
        service.deleteByCustomerKey(
          mockContext.tenantId,
          mockContext.userId,
          mockContext.mid,
          "QPP_Query_abc",
        ),
      ).rejects.toThrow("SOAP retrieve failed");
    });

    it("throws on delete SOAP error", async () => {
      // Arrange - retrieve succeeds, delete fails
      mockMceBridge.soapRequest
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              Results: { ObjectID: "obj-123", CustomerKey: "QPP_Query_abc" },
            },
          },
        })
        .mockRejectedValueOnce(new Error("SOAP delete failed"));

      // Act & Assert
      await expect(
        service.deleteByCustomerKey(
          mockContext.tenantId,
          mockContext.userId,
          mockContext.mid,
          "QPP_Query_abc",
        ),
      ).rejects.toThrow("SOAP delete failed");
    });

    it("escapes XML special characters in customerKey", async () => {
      // Arrange
      mockMceBridge.soapRequest
        .mockResolvedValueOnce(emptyResponse) // CustomerKey
        .mockResolvedValueOnce(emptyResponse); // folder+key

      // Act
      await service.deleteByCustomerKey(
        mockContext.tenantId,
        mockContext.userId,
        mockContext.mid,
        "QPP_Query_<test>&'\"",
      );

      // Assert - first call (by CustomerKey) should have escaped value
      expect(mockMceBridge.soapRequest).toHaveBeenNthCalledWith(
        1,
        mockContext.tenantId,
        mockContext.userId,
        mockContext.mid,
        expect.stringContaining(
          "<Value>QPP_Query_&lt;test&gt;&amp;&apos;&quot;</Value>",
        ),
        "Retrieve",
      );
    });

    it("skips folder retrieve when no folderId in tenantSettings", async () => {
      // Arrange - no folder configured
      mockDb.setSelectResult([{ qppFolderId: null }]);
      mockMceBridge.soapRequest.mockResolvedValueOnce(emptyResponse);

      // Act
      const result = await service.deleteByCustomerKey(
        mockContext.tenantId,
        mockContext.userId,
        mockContext.mid,
        "QPP_Query_abc",
      );

      // Assert - only 1 retrieve call (by CustomerKey), no folder operations
      expect(result).toBe(false);
      expect(mockMceBridge.soapRequest).toHaveBeenCalledTimes(1);
    });
  });
});
