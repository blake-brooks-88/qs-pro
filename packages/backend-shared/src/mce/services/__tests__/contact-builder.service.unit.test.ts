import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ErrorCode } from "../../../common/errors";
import { ContactBuilderService } from "../contact-builder.service";

const mockRequest = vi.fn();
const mockMceBridge = {
  request: mockRequest,
} as unknown as ConstructorParameters<typeof ContactBuilderService>[0];

const T = "tenant-1";
const U = "user-1";
const M = "mid-1";

function makeAttrSetDefResponse(items: unknown[]) {
  return { page: 1, pageSize: 25, count: items.length, items };
}

function makeSetDef(
  id: string,
  fullyQualifiedName: string,
  attributes: Array<{ id: string; storageName?: string }>,
  relationships: Array<{
    leftId: string;
    rightId: string;
    attrs: Array<{ leftAttributeID: string; rightAttributeID: string }>;
  }> = [],
) {
  return {
    id,
    fullyQualifiedName,
    attributes: attributes.map((a) => ({
      id: a.id,
      storageName: a.storageName,
      key: a.id,
    })),
    relationships: relationships.map((r) => ({
      leftItem: { identifier: r.leftId },
      rightItem: { identifier: r.rightId },
      relationshipAttributes: r.attrs,
    })),
  };
}

describe("ContactBuilderService", () => {
  let service: ContactBuilderService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ContactBuilderService(mockMceBridge);
  });

  describe("getRelationshipEdges", () => {
    it("parses MCE response with relationships and returns edges", async () => {
      const setA = makeSetDef(
        "sa",
        "SetA",
        [{ id: "a1", storageName: "ColX" }],
        [
          {
            leftId: "sa",
            rightId: "sb",
            attrs: [{ leftAttributeID: "a1", rightAttributeID: "b1" }],
          },
        ],
      );
      const setB = makeSetDef("sb", "SetB", [
        { id: "b1", storageName: "ColY" },
      ]);

      mockRequest.mockResolvedValue(makeAttrSetDefResponse([setA, setB]));

      const edges = await service.getRelationshipEdges(T, U, M);

      expect(edges).toEqual([
        {
          sourceDE: "SetA",
          sourceColumn: "ColX",
          targetDE: "SetB",
          targetColumn: "ColY",
        },
      ]);
    });

    it("returns empty array for empty response", async () => {
      mockRequest.mockResolvedValue(makeAttrSetDefResponse([]));

      const edges = await service.getRelationshipEdges(T, U, M);

      expect(edges).toEqual([]);
    });

    it("returns empty array when response is null", async () => {
      mockRequest.mockResolvedValue(null);

      const edges = await service.getRelationshipEdges(T, U, M);

      expect(edges).toEqual([]);
    });

    it("skips edges where attribute IDs don't resolve", async () => {
      const setA = makeSetDef(
        "sa",
        "SetA",
        [{ id: "a1", storageName: "ColX" }],
        [
          {
            leftId: "sa",
            rightId: "sb",
            attrs: [{ leftAttributeID: "a1", rightAttributeID: "unknown" }],
          },
        ],
      );
      const setB = makeSetDef("sb", "SetB", [
        { id: "b1", storageName: "ColY" },
      ]);

      mockRequest.mockResolvedValue(makeAttrSetDefResponse([setA, setB]));

      const edges = await service.getRelationshipEdges(T, U, M);

      expect(edges).toEqual([]);
    });

    it("skips edges where set definition is missing", async () => {
      const setA = makeSetDef(
        "sa",
        "SetA",
        [{ id: "a1", storageName: "ColX" }],
        [
          {
            leftId: "sa",
            rightId: "missing",
            attrs: [{ leftAttributeID: "a1", rightAttributeID: "b1" }],
          },
        ],
      );

      mockRequest.mockResolvedValue(makeAttrSetDefResponse([setA]));

      const edges = await service.getRelationshipEdges(T, U, M);

      expect(edges).toEqual([]);
    });

    it("deduplicates bidirectional edges (same relationship from both sides)", async () => {
      const setA = makeSetDef(
        "sa",
        "SetA",
        [{ id: "a1", storageName: "ColX" }],
        [
          {
            leftId: "sa",
            rightId: "sb",
            attrs: [{ leftAttributeID: "a1", rightAttributeID: "b1" }],
          },
        ],
      );
      const setB = makeSetDef(
        "sb",
        "SetB",
        [{ id: "b1", storageName: "ColY" }],
        [
          {
            leftId: "sb",
            rightId: "sa",
            attrs: [{ leftAttributeID: "b1", rightAttributeID: "a1" }],
          },
        ],
      );

      mockRequest.mockResolvedValue(makeAttrSetDefResponse([setA, setB]));

      const edges = await service.getRelationshipEdges(T, U, M);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        sourceDE: "SetA",
        sourceColumn: "ColX",
        targetDE: "SetB",
        targetColumn: "ColY",
      });
    });

    it("does not falsely deduplicate edges with same strings in different pairings", async () => {
      const setA = makeSetDef(
        "sa",
        "SetA",
        [
          { id: "ax", storageName: "colX" },
          { id: "ay", storageName: "colY" },
        ],
        [
          {
            leftId: "sa",
            rightId: "sb",
            attrs: [{ leftAttributeID: "ax", rightAttributeID: "by" }],
          },
          {
            leftId: "sa",
            rightId: "sb",
            attrs: [{ leftAttributeID: "ay", rightAttributeID: "bx" }],
          },
        ],
      );
      const setB = makeSetDef("sb", "SetB", [
        { id: "bx", storageName: "colX" },
        { id: "by", storageName: "colY" },
      ]);

      mockRequest.mockResolvedValue(makeAttrSetDefResponse([setA, setB]));

      const edges = await service.getRelationshipEdges(T, U, M);

      expect(edges).toHaveLength(2);
      expect(edges).toContainEqual({
        sourceDE: "SetA",
        sourceColumn: "colX",
        targetDE: "SetB",
        targetColumn: "colY",
      });
      expect(edges).toContainEqual({
        sourceDE: "SetA",
        sourceColumn: "colY",
        targetDE: "SetB",
        targetColumn: "colX",
      });
    });

    it("returns empty array when MCE returns MCE_FORBIDDEN", async () => {
      mockRequest.mockRejectedValue(new AppError(ErrorCode.MCE_FORBIDDEN));

      const edges = await service.getRelationshipEdges(T, U, M);

      expect(edges).toEqual([]);
    });

    it("returns empty array when MCE returns MCE_BAD_REQUEST", async () => {
      mockRequest.mockRejectedValue(new AppError(ErrorCode.MCE_BAD_REQUEST));

      const edges = await service.getRelationshipEdges(T, U, M);

      expect(edges).toEqual([]);
    });

    it("rethrows non-AppError errors", async () => {
      mockRequest.mockRejectedValue(new Error("network failure"));

      await expect(service.getRelationshipEdges(T, U, M)).rejects.toThrow(
        "network failure",
      );
    });

    it("rethrows AppError with non-swallowed error codes", async () => {
      mockRequest.mockRejectedValue(new AppError(ErrorCode.MCE_SERVER_ERROR));

      await expect(service.getRelationshipEdges(T, U, M)).rejects.toThrow(
        AppError,
      );
    });
  });
});
