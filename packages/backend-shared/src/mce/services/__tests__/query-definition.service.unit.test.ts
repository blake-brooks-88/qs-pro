import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ErrorCode } from "../../../common/errors";
import { QueryDefinitionService } from "../query-definition.service";

const mockSoapRequest = vi.fn();
const mockMceBridge = {
  soapRequest: mockSoapRequest,
} as unknown as ConstructorParameters<typeof QueryDefinitionService>[0];

const T = "tenant-1";
const U = "user-1";
const M = "mid-1";

describe("QueryDefinitionService", () => {
  let service: QueryDefinitionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new QueryDefinitionService(mockMceBridge);
  });

  // ---------------------------------------------------------------------------
  // retrieve
  // ---------------------------------------------------------------------------
  describe("retrieve", () => {
    it("returns a QueryDefinition from an array Results", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [
              {
                ObjectID: "obj-1",
                CustomerKey: "key-1",
                Name: "Query 1",
                CategoryID: "42",
              },
            ],
          },
        },
      });

      const result = await service.retrieve(T, U, M, "key-1");

      expect(result).toEqual({
        objectId: "obj-1",
        customerKey: "key-1",
        name: "Query 1",
        categoryId: 42,
      });
      expect(mockSoapRequest).toHaveBeenCalledWith(
        T,
        U,
        M,
        expect.any(String),
        "Retrieve",
        expect.any(Number),
      );
    });

    it("returns a QueryDefinition from a single Result object (non-array)", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: {
              ObjectID: "obj-single",
              CustomerKey: "key-single",
              Name: "Single",
            },
          },
        },
      });

      const result = await service.retrieve(T, U, M, "key-single");

      expect(result).toEqual({
        objectId: "obj-single",
        customerKey: "key-single",
        name: "Single",
        categoryId: undefined,
      });
    });

    it("returns null when status is Error with no Results", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "Error",
          },
        },
      });

      const result = await service.retrieve(T, U, M, "missing");
      expect(result).toBeNull();
    });

    it("throws when status is Error with Results present", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "Error",
            Results: [{ ObjectID: "obj-err" }],
          },
        },
      });

      await expect(service.retrieve(T, U, M, "bad")).rejects.toThrow(AppError);
    });

    it("throws for non-OK, non-MoreDataAvailable, non-Error status", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "SomethingWeird",
          },
        },
      });

      await expect(service.retrieve(T, U, M, "x")).rejects.toThrow(AppError);
    });

    it("returns null when Results is missing", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
          },
        },
      });

      const result = await service.retrieve(T, U, M, "none");
      expect(result).toBeNull();
    });

    it("returns null when Results is an empty array", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [],
          },
        },
      });

      const result = await service.retrieve(T, U, M, "empty");
      expect(result).toBeNull();
    });

    it("parses CategoryID as integer", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [
              {
                ObjectID: "o",
                CustomerKey: "k",
                Name: "n",
                CategoryID: "999",
              },
            ],
          },
        },
      });

      const result = await service.retrieve(T, U, M, "k");
      expect(result?.categoryId).toBe(999);
    });

    it("sets categoryId to undefined when CategoryID is absent", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [{ ObjectID: "o", CustomerKey: "k", Name: "n" }],
          },
        },
      });

      const result = await service.retrieve(T, U, M, "k");
      expect(result?.categoryId).toBeUndefined();
    });

    it("coerces missing fields to empty strings", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [{}],
          },
        },
      });

      const result = await service.retrieve(T, U, M, "k");
      expect(result).toEqual({
        objectId: "",
        customerKey: "",
        name: "",
        categoryId: undefined,
      });
    });

    it("handles MoreDataAvailable status without throwing", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "MoreDataAvailable",
            Results: [{ ObjectID: "o", CustomerKey: "k", Name: "n" }],
          },
        },
      });

      const result = await service.retrieve(T, U, M, "k");
      expect(result).toEqual({
        objectId: "o",
        customerKey: "k",
        name: "n",
        categoryId: undefined,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // retrieveByNameAndFolder
  // ---------------------------------------------------------------------------
  describe("retrieveByNameAndFolder", () => {
    it("returns a QueryDefinition on OK with array Results", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [
              {
                ObjectID: "obj-nf",
                CustomerKey: "key-nf",
                Name: "By Name",
                CategoryID: "10",
              },
            ],
          },
        },
      });

      const result = await service.retrieveByNameAndFolder(
        T,
        U,
        M,
        "By Name",
        10,
      );

      expect(result).toEqual({
        objectId: "obj-nf",
        customerKey: "key-nf",
        name: "By Name",
        categoryId: 10,
      });
    });

    it("returns a QueryDefinition from a single Result object", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: {
              ObjectID: "obj-s",
              CustomerKey: "key-s",
              Name: "Single",
            },
          },
        },
      });

      const result = await service.retrieveByNameAndFolder(T, U, M, "Single");
      expect(result).toEqual({
        objectId: "obj-s",
        customerKey: "key-s",
        name: "Single",
        categoryId: undefined,
      });
    });

    it("returns null when status is Error with no Results", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: { OverallStatus: "Error" },
        },
      });

      const result = await service.retrieveByNameAndFolder(T, U, M, "x");
      expect(result).toBeNull();
    });

    it("throws when status is Error with Results present", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "Error",
            Results: [{ ObjectID: "obj" }],
          },
        },
      });

      await expect(
        service.retrieveByNameAndFolder(T, U, M, "x"),
      ).rejects.toThrow(AppError);
    });

    it("throws for a non-standard error status", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: { OverallStatus: "Fault" },
        },
      });

      await expect(
        service.retrieveByNameAndFolder(T, U, M, "x"),
      ).rejects.toThrow(AppError);
    });

    it("returns null when Results is missing", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: { OverallStatus: "OK" },
        },
      });

      const result = await service.retrieveByNameAndFolder(T, U, M, "x");
      expect(result).toBeNull();
    });

    it("returns null when Results is an empty array", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [],
          },
        },
      });

      const result = await service.retrieveByNameAndFolder(T, U, M, "x");
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // retrieveByFolder
  // ---------------------------------------------------------------------------
  describe("retrieveByFolder", () => {
    it("returns results from a single page", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [
              {
                ObjectID: "o1",
                CustomerKey: "k1",
                Name: "Q1",
                CategoryID: "100",
              },
              {
                ObjectID: "o2",
                CustomerKey: "k2",
                Name: "Q2",
                CategoryID: "100",
              },
            ],
          },
        },
      });

      const results = await service.retrieveByFolder(T, U, M, 100);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        objectId: "o1",
        customerKey: "k1",
        name: "Q1",
        categoryId: 100,
      });
    });

    it("handles a single (non-array) Result", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: {
              ObjectID: "o-single",
              CustomerKey: "k-single",
              Name: "Single",
              CategoryID: "5",
            },
          },
        },
      });

      const results = await service.retrieveByFolder(T, U, M, 5);

      expect(results).toHaveLength(1);
      expect(results[0]?.objectId).toBe("o-single");
    });

    it("handles multi-page with MoreDataAvailable and continue requests", async () => {
      mockSoapRequest
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              OverallStatus: "MoreDataAvailable",
              RequestID: "req-abc",
              Results: [{ ObjectID: "p1", CustomerKey: "pk1", Name: "Page1" }],
            },
          },
        })
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              OverallStatus: "OK",
              Results: [{ ObjectID: "p2", CustomerKey: "pk2", Name: "Page2" }],
            },
          },
        });

      const results = await service.retrieveByFolder(T, U, M, 50);

      expect(results).toHaveLength(2);
      expect(mockSoapRequest).toHaveBeenCalledTimes(2);
    });

    it("throws MCE_PAGINATION_EXCEEDED when MAX_PAGES (10) exceeded", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "MoreDataAvailable",
            RequestID: "keep-going",
            Results: [{ ObjectID: "o", CustomerKey: "k", Name: "n" }],
          },
        },
      });

      const error = await service
        .retrieveByFolder(T, U, M, 1)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.MCE_PAGINATION_EXCEEDED);
    });

    it("throws on error status from SOAP", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "Error",
          },
        },
      });

      await expect(service.retrieveByFolder(T, U, M, 1)).rejects.toThrow(
        AppError,
      );
    });

    it("returns empty array when no Results present", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: { OverallStatus: "OK" },
        },
      });

      const results = await service.retrieveByFolder(T, U, M, 1);
      expect(results).toEqual([]);
    });

    it("applies olderThan date filter", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [],
          },
        },
      });

      const olderThan = new Date("2026-01-15T00:00:00Z");
      await service.retrieveByFolder(T, U, M, 200, olderThan);

      const calledBody = mockSoapRequest.mock.calls[0]?.[3] as string;
      expect(calledBody).toContain("ComplexFilterPart");
      expect(calledBody).toContain("CreatedDate");
      expect(calledBody).toContain("lessThan");
      expect(calledBody).toContain("2026-01-15");
    });

    it("uses SimpleFilterPart when olderThan is not provided", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: { OverallStatus: "OK" },
        },
      });

      await service.retrieveByFolder(T, U, M, 200);

      const calledBody = mockSoapRequest.mock.calls[0]?.[3] as string;
      expect(calledBody).toContain("SimpleFilterPart");
      expect(calledBody).not.toContain("ComplexFilterPart");
    });

    it("throws on error status from a continue request (page 2)", async () => {
      mockSoapRequest
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              OverallStatus: "MoreDataAvailable",
              RequestID: "req-1",
              Results: [{ ObjectID: "o", CustomerKey: "k", Name: "n" }],
            },
          },
        })
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              OverallStatus: "Error",
            },
          },
        });

      await expect(service.retrieveByFolder(T, U, M, 1)).rejects.toThrow(
        AppError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // retrieveAll
  // ---------------------------------------------------------------------------
  describe("retrieveAll", () => {
    it("returns results with extended fields from a single page", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [
              {
                ObjectID: "o-a",
                CustomerKey: "k-a",
                Name: "Query A",
                CategoryID: "10",
                TargetUpdateType: "Overwrite",
                ModifiedDate: "2026-02-01T12:00:00Z",
                Status: "Active",
                DataExtensionTarget: { Name: "Subscriber_Weekly" },
              },
            ],
          },
        },
      });

      const results = await service.retrieveAll(T, U, M);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        objectId: "o-a",
        customerKey: "k-a",
        name: "Query A",
        categoryId: 10,
        targetUpdateType: "Overwrite",
        modifiedDate: "2026-02-01T12:00:00Z",
        status: "Active",
        targetDEName: "Subscriber_Weekly",
      });
    });

    it("maps optional fields as undefined when absent", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [{ ObjectID: "o", CustomerKey: "k", Name: "n" }],
          },
        },
      });

      const results = await service.retrieveAll(T, U, M);

      expect(results[0]?.targetUpdateType).toBeUndefined();
      expect(results[0]?.modifiedDate).toBeUndefined();
      expect(results[0]?.status).toBeUndefined();
      expect(results[0]?.targetDEName).toBeUndefined();
    });

    it("handles a single (non-array) Result", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: {
              ObjectID: "solo",
              CustomerKey: "solo-k",
              Name: "Solo",
              TargetUpdateType: "Append",
            },
          },
        },
      });

      const results = await service.retrieveAll(T, U, M);

      expect(results).toHaveLength(1);
      expect(results[0]?.targetUpdateType).toBe("Append");
    });

    it("handles multi-page pagination", async () => {
      mockSoapRequest
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              OverallStatus: "MoreDataAvailable",
              RequestID: "req-page",
              Results: [{ ObjectID: "p1", CustomerKey: "pk1", Name: "Page1" }],
            },
          },
        })
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              OverallStatus: "OK",
              Results: [{ ObjectID: "p2", CustomerKey: "pk2", Name: "Page2" }],
            },
          },
        });

      const results = await service.retrieveAll(T, U, M);

      expect(results).toHaveLength(2);
      expect(mockSoapRequest).toHaveBeenCalledTimes(2);
    });

    it("throws MCE_PAGINATION_EXCEEDED when MAX_PAGES (10) exceeded", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "MoreDataAvailable",
            RequestID: "infinite",
            Results: [{ ObjectID: "o", CustomerKey: "k", Name: "n" }],
          },
        },
      });

      const error = await service.retrieveAll(T, U, M).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.MCE_PAGINATION_EXCEEDED);
    });

    it("throws on error status", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: { OverallStatus: "Error" },
        },
      });

      await expect(service.retrieveAll(T, U, M)).rejects.toThrow(AppError);
    });

    it("returns empty array when no Results", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: { OverallStatus: "OK" },
        },
      });

      const results = await service.retrieveAll(T, U, M);
      expect(results).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // retrieveDetail
  // ---------------------------------------------------------------------------
  describe("retrieveDetail", () => {
    it("returns full QueryDefinitionDetail on OK", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [
              {
                ObjectID: "det-o",
                CustomerKey: "det-k",
                Name: "Detail Query",
                CategoryID: "42",
                QueryText: "SELECT Email FROM [Subscribers]",
                TargetUpdateType: "Overwrite",
                DataExtensionTarget: {
                  Name: "Result DE",
                  CustomerKey: "result-de-key",
                },
                ModifiedDate: "2026-02-10T10:00:00Z",
                Status: "Active",
              },
            ],
          },
        },
      });

      const result = await service.retrieveDetail(T, U, M, "det-k");

      expect(result).toEqual({
        objectId: "det-o",
        customerKey: "det-k",
        name: "Detail Query",
        categoryId: 42,
        queryText: "SELECT Email FROM [Subscribers]",
        targetUpdateType: "Overwrite",
        targetDEName: "Result DE",
        targetDECustomerKey: "result-de-key",
        modifiedDate: "2026-02-10T10:00:00Z",
        status: "Active",
      });
    });

    it("returns null when Error status with no Results", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: { OverallStatus: "Error" },
        },
      });

      const result = await service.retrieveDetail(T, U, M, "x");
      expect(result).toBeNull();
    });

    it("throws when Error status with Results present", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "Error",
            Results: [{ ObjectID: "err-obj" }],
          },
        },
      });

      await expect(service.retrieveDetail(T, U, M, "x")).rejects.toThrow(
        AppError,
      );
    });

    it("returns null when Results is missing", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: { OverallStatus: "OK" },
        },
      });

      const result = await service.retrieveDetail(T, U, M, "x");
      expect(result).toBeNull();
    });

    it("returns null when Results is an empty array", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [],
          },
        },
      });

      const result = await service.retrieveDetail(T, U, M, "x");
      expect(result).toBeNull();
    });

    it("handles a single (non-array) Result object", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: {
              ObjectID: "single-d",
              CustomerKey: "single-dk",
              Name: "Single Detail",
              QueryText: "SELECT 1",
            },
          },
        },
      });

      const result = await service.retrieveDetail(T, U, M, "single-dk");
      expect(result?.objectId).toBe("single-d");
      expect(result?.queryText).toBe("SELECT 1");
    });

    it("returns undefined for DataExtensionTarget fields when absent", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [
              {
                ObjectID: "o",
                CustomerKey: "k",
                Name: "n",
                QueryText: "SELECT 1",
              },
            ],
          },
        },
      });

      const result = await service.retrieveDetail(T, U, M, "k");

      expect(result?.targetDEName).toBeUndefined();
      expect(result?.targetDECustomerKey).toBeUndefined();
    });

    it("returns undefined for optional fields when absent", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [
              {
                ObjectID: "o",
                CustomerKey: "k",
                Name: "n",
                QueryText: "SELECT 1",
              },
            ],
          },
        },
      });

      const result = await service.retrieveDetail(T, U, M, "k");

      expect(result?.targetUpdateType).toBeUndefined();
      expect(result?.modifiedDate).toBeUndefined();
      expect(result?.status).toBeUndefined();
    });

    it("handles DataExtensionTarget with only Name", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [
              {
                ObjectID: "o",
                CustomerKey: "k",
                Name: "n",
                QueryText: "q",
                DataExtensionTarget: { Name: "Only Name" },
              },
            ],
          },
        },
      });

      const result = await service.retrieveDetail(T, U, M, "k");
      expect(result?.targetDEName).toBe("Only Name");
      expect(result?.targetDECustomerKey).toBeUndefined();
    });

    it("handles DataExtensionTarget with only CustomerKey", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "OK",
            Results: [
              {
                ObjectID: "o",
                CustomerKey: "k",
                Name: "n",
                QueryText: "q",
                DataExtensionTarget: { CustomerKey: "only-key" },
              },
            ],
          },
        },
      });

      const result = await service.retrieveDetail(T, U, M, "k");
      expect(result?.targetDEName).toBeUndefined();
      expect(result?.targetDECustomerKey).toBe("only-key");
    });

    it("handles MoreDataAvailable status without throwing", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            OverallStatus: "MoreDataAvailable",
            Results: [
              {
                ObjectID: "o",
                CustomerKey: "k",
                Name: "n",
                QueryText: "q",
              },
            ],
          },
        },
      });

      const result = await service.retrieveDetail(T, U, M, "k");
      expect(result).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe("create", () => {
    const createParams = {
      name: "Test Query",
      customerKey: "test-key",
      categoryId: 500,
      targetId: "de-obj-id",
      targetCustomerKey: "de-key",
      targetName: "DE Name",
      queryText: "SELECT Email FROM Subscribers",
    };

    it("returns objectId on successful creation", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          CreateResponse: {
            Results: {
              StatusCode: "OK",
              NewObjectID: "new-obj-123",
            },
          },
        },
      });

      const result = await service.create(T, U, M, createParams);

      expect(result).toEqual({ objectId: "new-obj-123" });
      expect(mockSoapRequest).toHaveBeenCalledWith(
        T,
        U,
        M,
        expect.any(String),
        "Create",
        expect.any(Number),
      );
    });

    it("throws when StatusCode is not OK", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          CreateResponse: {
            Results: {
              StatusCode: "Error",
              StatusMessage: "Duplicate name",
            },
          },
        },
      });

      await expect(service.create(T, U, M, createParams)).rejects.toThrow(
        AppError,
      );
    });

    it("throws when StatusCode is missing (undefined)", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          CreateResponse: {
            Results: {},
          },
        },
      });

      await expect(service.create(T, U, M, createParams)).rejects.toThrow(
        AppError,
      );
    });

    it("throws when NewObjectID is missing", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          CreateResponse: {
            Results: {
              StatusCode: "OK",
            },
          },
        },
      });

      await expect(service.create(T, U, M, createParams)).rejects.toThrow(
        AppError,
      );
    });

    it("throws when NewObjectID is not a string", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          CreateResponse: {
            Results: {
              StatusCode: "OK",
              NewObjectID: 12345,
            },
          },
        },
      });

      await expect(service.create(T, U, M, createParams)).rejects.toThrow(
        AppError,
      );
    });

    it("throws when Results is undefined", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          CreateResponse: {},
        },
      });

      await expect(service.create(T, U, M, createParams)).rejects.toThrow(
        AppError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // perform
  // ---------------------------------------------------------------------------
  describe("perform", () => {
    it("returns taskId from TaskID when Task.StatusCode is OK", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          PerformResponseMsg: {
            Results: {
              Result: {
                StatusCode: "OK",
                TaskID: "task-from-taskid",
                Task: {
                  StatusCode: "OK",
                  ID: "task-from-id",
                },
              },
            },
          },
        },
      });

      const result = await service.perform(T, U, M, "obj-1");

      expect(result).toEqual({ taskId: "task-from-taskid" });
      expect(mockSoapRequest).toHaveBeenCalledWith(
        T,
        U,
        M,
        expect.any(String),
        "Perform",
        expect.any(Number),
      );
    });

    it("returns taskId from Task.ID when TaskID is absent", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          PerformResponseMsg: {
            Results: {
              Result: {
                StatusCode: "OK",
                Task: {
                  StatusCode: "OK",
                  ID: "task-alt-id",
                },
              },
            },
          },
        },
      });

      const result = await service.perform(T, U, M, "obj-1");
      expect(result).toEqual({ taskId: "task-alt-id" });
    });

    it("succeeds when Task.StatusCode is OK but Result.StatusCode is not", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          PerformResponseMsg: {
            Results: {
              Result: {
                StatusCode: "Error",
                TaskID: "task-ok-via-task",
                Task: {
                  StatusCode: "OK",
                  ID: "task-ok-via-task",
                },
              },
            },
          },
        },
      });

      const result = await service.perform(T, U, M, "obj-1");
      expect(result).toEqual({ taskId: "task-ok-via-task" });
    });

    it("succeeds when Result.StatusCode is OK but Task.StatusCode is not", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          PerformResponseMsg: {
            Results: {
              Result: {
                StatusCode: "OK",
                TaskID: "task-ok-via-result",
                Task: {
                  StatusCode: "Error",
                },
              },
            },
          },
        },
      });

      const result = await service.perform(T, U, M, "obj-1");
      expect(result).toEqual({ taskId: "task-ok-via-result" });
    });

    it("throws when both Task.StatusCode and Result.StatusCode are not OK", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          PerformResponseMsg: {
            Results: {
              Result: {
                StatusCode: "Error",
                StatusMessage: "Failed to perform",
                Task: {
                  StatusCode: "Error",
                  StatusMessage: "Task failure",
                },
              },
            },
          },
        },
      });

      await expect(service.perform(T, U, M, "obj-1")).rejects.toThrow(AppError);
    });

    it("throws when Task is undefined and Result.StatusCode is not OK", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          PerformResponseMsg: {
            Results: {
              Result: {
                StatusCode: "Error",
                StatusMessage: "No task",
              },
            },
          },
        },
      });

      await expect(service.perform(T, U, M, "obj-1")).rejects.toThrow(AppError);
    });

    it("throws when no TaskID or Task.ID is present despite OK status", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          PerformResponseMsg: {
            Results: {
              Result: {
                StatusCode: "OK",
                Task: { StatusCode: "OK" },
              },
            },
          },
        },
      });

      await expect(service.perform(T, U, M, "obj-1")).rejects.toThrow(AppError);
    });

    it("throws when Result is undefined", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          PerformResponseMsg: {
            Results: {},
          },
        },
      });

      await expect(service.perform(T, U, M, "obj-1")).rejects.toThrow(AppError);
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------
  describe("delete", () => {
    it("resolves on OK StatusCode", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          DeleteResponse: {
            Results: {
              StatusCode: "OK",
            },
          },
        },
      });

      await expect(service.delete(T, U, M, "obj-del")).resolves.toBeUndefined();

      expect(mockSoapRequest).toHaveBeenCalledWith(
        T,
        U,
        M,
        expect.any(String),
        "Delete",
        expect.any(Number),
      );
    });

    it("throws when StatusCode is not OK", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          DeleteResponse: {
            Results: {
              StatusCode: "Error",
              StatusMessage: "Object not found",
            },
          },
        },
      });

      await expect(service.delete(T, U, M, "obj-del")).rejects.toThrow(
        AppError,
      );
    });

    it("succeeds when StatusCode is missing (no Results)", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          DeleteResponse: {},
        },
      });

      await expect(service.delete(T, U, M, "obj-del")).resolves.toBeUndefined();
    });

    it("succeeds when Results is present but StatusCode is undefined", async () => {
      mockSoapRequest.mockResolvedValue({
        Body: {
          DeleteResponse: {
            Results: {},
          },
        },
      });

      await expect(service.delete(T, U, M, "obj-del")).resolves.toBeUndefined();
    });
  });
});
