import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Test, TestingModule } from "@nestjs/testing";
import { createDataExtensionServiceStub } from "@qpp/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MceBridgeService } from "./mce-bridge.service";
import { MetadataService } from "./metadata.service";
import { DataExtensionService } from "./services/data-extension.service";

describe("MetadataService", () => {
  let service: MetadataService;

  const mockBridge = {
    soapRequest: vi.fn(),
  };

  const mockCache = {
    get: vi.fn(),
    set: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetadataService,
        {
          provide: MceBridgeService,
          useValue: mockBridge,
        },
        {
          provide: DataExtensionService,
          useValue: createDataExtensionServiceStub(),
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCache,
        },
      ],
    }).compile();

    service = module.get<MetadataService>(MetadataService);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getFolders", () => {
    it("returns cached folders when available", async () => {
      // Arrange
      const cachedFolders = [
        { id: "1", Name: "Test Folder" },
        { id: "2", Name: "Another Folder" },
      ];
      mockCache.get.mockResolvedValue(cachedFolders);

      // Act
      const result = await service.getFolders("t1", "u1", "mid1", "eid1");

      // Assert - observable behavior: returns cached data structure
      expect(result).toEqual(cachedFolders);
      expect(result).toHaveLength(2);
    });

    it("returns merged local and shared folders on cache miss", async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockBridge.soapRequest
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              Results: [{ ID: "1", Name: "LocalFolder" }],
            },
          },
        })
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              Results: [{ ID: "2", Name: "SharedFolder" }],
            },
          },
        });

      // Act
      const result = await service.getFolders("t1", "u1", "mid1", "eid1");

      // Assert - observable behavior: merged folders returned
      expect(result).toEqual([
        { ID: "1", Name: "LocalFolder" },
        { ID: "2", Name: "SharedFolder" },
      ]);
    });

    it("returns all folders across multiple pages when paginated", async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockBridge.soapRequest.mockImplementation(
        async (_tid: string, _uid: string, _mid: string, body: string) => {
          if (body.includes("<ClientID>eid1</ClientID>")) {
            // Shared Call
            return {
              Body: {
                RetrieveResponseMsg: {
                  OverallStatus: "OK",
                  Results: [{ ID: "3", Name: "Folder3" }],
                },
              },
            };
          }
          if (body.includes("<ContinueRequest>req-123</ContinueRequest>")) {
            // Local Call - Page 2
            return {
              Body: {
                RetrieveResponseMsg: {
                  OverallStatus: "OK",
                  Results: [{ ID: "2", Name: "Folder2" }],
                },
              },
            };
          }
          // Local Call - Page 1
          return {
            Body: {
              RetrieveResponseMsg: {
                OverallStatus: "MoreDataAvailable",
                RequestID: "req-123",
                Results: [{ ID: "1", Name: "Folder1" }],
              },
            },
          };
        },
      );

      // Act
      const result = await service.getFolders("t1", "u1", "mid1", "eid1");

      // Assert - observable behavior: all 3 folders returned from pagination
      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ID: "1", Name: "Folder1" }),
          expect.objectContaining({ ID: "2", Name: "Folder2" }),
          expect.objectContaining({ ID: "3", Name: "Folder3" }),
        ]),
      );
    });

    it("stops pagination after 50 pages", async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      let page = 0;

      mockBridge.soapRequest.mockImplementation(async () => {
        page += 1;
        return {
          Body: {
            RetrieveResponseMsg: {
              OverallStatus: "MoreDataAvailable",
              RequestID: `req-${page}`,
              Results: [{ ID: String(page), Name: `Folder${page}` }],
            },
          },
        };
      });

      // Act
      const result = await service.getFolders("t1", "u1", "mid1", undefined);

      // Assert - observable behavior: returns data from first 50 pages only
      expect(result).toHaveLength(50);
      expect(page).toBe(50);
    });

    it("deduplicates folders by ID across local and shared results", async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockBridge.soapRequest
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              OverallStatus: "OK",
              Results: [{ ID: "1", Name: "LocalFolder" }],
            },
          },
        })
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              OverallStatus: "OK",
              Results: [{ ID: "1", Name: "SharedFolder" }],
            },
          },
        });

      // Act
      const result = await service.getFolders("t1", "u1", "mid1", "eid1");

      // Assert - observable behavior: only one folder with ID=1 returned
      expect(result).toEqual([{ ID: "1", Name: "LocalFolder" }]);
    });
  });

  describe("getDataExtensions", () => {
    it("returns merged local and shared data extensions", async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockBridge.soapRequest
        .mockResolvedValueOnce({
          // Local
          Body: {
            RetrieveResponseMsg: {
              Results: [{ CustomerKey: "DE1", Name: "LocalDE" }],
            },
          },
        })
        .mockResolvedValueOnce({
          // Shared
          Body: {
            RetrieveResponseMsg: {
              Results: [{ CustomerKey: "DE2", Name: "SharedDE" }],
            },
          },
        });

      // Act
      const result = await service.getDataExtensions(
        "t1",
        "u1",
        "mid1",
        "eid123",
      );

      // Assert - observable behavior: both local and shared DEs returned
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ CustomerKey: "DE1", Name: "LocalDE" }),
          expect.objectContaining({ CustomerKey: "DE2", Name: "SharedDE" }),
        ]),
      );
    });

    // NOTE: getDataExtensions does not cache results (unlike getFolders and getFields)
    // This was discovered during behavioral assertion refactoring - the original
    // implementation-coupled test masked this absence of caching behavior.
  });

  describe("getFields", () => {
    it("returns fields for a data extension", async () => {
      // Arrange
      const deKey = "MY_DE_KEY";
      mockCache.get.mockResolvedValue(null);
      mockBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: [
              { Name: "SubscriberKey", FieldType: "Text" },
              { Name: "EmailAddress", FieldType: "EmailAddress" },
            ],
          },
        },
      });

      // Act
      const result = await service.getFields("t1", "u1", "mid1", deKey);

      // Assert - observable behavior: fields returned with expected structure
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ Name: "SubscriberKey", FieldType: "Text" }),
          expect.objectContaining({
            Name: "EmailAddress",
            FieldType: "EmailAddress",
          }),
        ]),
      );
    });

    it("returns cached fields when available", async () => {
      // Arrange
      const cachedFields = [
        { Name: "Field1", FieldType: "Text" },
        { Name: "Field2", FieldType: "Number" },
      ];
      mockCache.get.mockResolvedValue(cachedFields);

      // Act
      const result = await service.getFields("t1", "u1", "mid1", "CACHED_DE");

      // Assert - observable behavior: returns cached data
      expect(result).toEqual(cachedFields);
    });

    it("returns empty array when DE has no fields", async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockBridge.soapRequest.mockResolvedValue({
        Body: { RetrieveResponseMsg: { Results: [] } },
      });

      // Act
      const result = await service.getFields("t1", "u1", "mid1", "EMPTY_DE");

      // Assert - observable behavior: empty array for DE with no fields
      expect(result).toEqual([]);
    });
  });
});
