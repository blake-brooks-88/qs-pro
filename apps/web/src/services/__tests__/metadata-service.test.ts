import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/store/auth-store";
import { server } from "@/test/mocks/server";

import {
  type DataExtensionFieldResponseDto,
  type DataExtensionResponseDto,
  type DataFolderResponseDto,
  getDataExtensions,
  getFields,
  getFolders,
} from "../metadata";

describe("metadata service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({
      user: null,
      tenant: null,
      csrfToken: null,
      isAuthenticated: false,
    });
  });

  describe("getFolders()", () => {
    it("fetches folders from /metadata/folders without eid param", async () => {
      let capturedUrl = "";
      const mockFolders: DataFolderResponseDto[] = [
        { ID: 1, Name: "Root", ParentFolder: null },
        { ID: 2, Name: "Data Extensions", ParentFolder: { ID: 1 } },
      ];

      server.use(
        http.get("/api/metadata/folders", ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(mockFolders);
        }),
      );

      const result = await getFolders();

      expect(capturedUrl).not.toContain("eid=");
      expect(result).toEqual(mockFolders);
      expect(result).toHaveLength(2);
    });

    it("fetches folders with eid param when provided", async () => {
      let capturedUrl = "";
      const mockFolders: DataFolderResponseDto[] = [
        { ID: 100, Name: "BU Folder", ParentFolder: null },
      ];

      server.use(
        http.get("/api/metadata/folders", ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(mockFolders);
        }),
      );

      const result = await getFolders("eid-12345");

      expect(capturedUrl).toContain("eid=eid-12345");
      expect(result).toEqual(mockFolders);
    });

    it("returns empty array when no folders exist", async () => {
      server.use(
        http.get("/api/metadata/folders", () => {
          return HttpResponse.json([]);
        }),
      );

      const result = await getFolders();

      expect(result).toEqual([]);
    });

    it("throws on 401 unauthorized", async () => {
      server.use(
        http.get("/api/metadata/folders", () => {
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }),
      );

      await expect(getFolders()).rejects.toMatchObject({
        response: { status: 401 },
      });
    });

    it("throws on 500 server error", async () => {
      server.use(
        http.get("/api/metadata/folders", () => {
          return HttpResponse.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }),
      );

      await expect(getFolders()).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });

  describe("getDataExtensions()", () => {
    it("fetches data extensions with eid param", async () => {
      let capturedUrl = "";
      const mockExtensions: DataExtensionResponseDto[] = [
        { CustomerKey: "de-1", Name: "Subscribers", CategoryID: 100 },
        { CustomerKey: "de-2", Name: "Orders", CategoryID: 100 },
      ];

      server.use(
        http.get("/api/metadata/data-extensions", ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(mockExtensions);
        }),
      );

      const result = await getDataExtensions("my-eid");

      expect(capturedUrl).toContain("eid=my-eid");
      expect(result).toEqual(mockExtensions);
      expect(result).toHaveLength(2);
    });

    it("returns empty array when no data extensions exist", async () => {
      server.use(
        http.get("/api/metadata/data-extensions", () => {
          return HttpResponse.json([]);
        }),
      );

      const result = await getDataExtensions("empty-eid");

      expect(result).toEqual([]);
    });

    it("handles data extensions with string CategoryID", async () => {
      const mockExtensions: DataExtensionResponseDto[] = [
        { CustomerKey: "de-str", Name: "Test DE", CategoryID: "category-123" },
      ];

      server.use(
        http.get("/api/metadata/data-extensions", () => {
          return HttpResponse.json(mockExtensions);
        }),
      );

      const result = await getDataExtensions("test-eid");

      expect(result[0]?.CategoryID).toBe("category-123");
    });

    it("throws on 401 unauthorized", async () => {
      server.use(
        http.get("/api/metadata/data-extensions", () => {
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }),
      );

      await expect(getDataExtensions("test")).rejects.toMatchObject({
        response: { status: 401 },
      });
    });
  });

  describe("getFields()", () => {
    it("fetches fields for a customer key", async () => {
      let capturedUrl = "";
      const mockFields: DataExtensionFieldResponseDto[] = [
        {
          Name: "Id",
          FieldType: "Number",
          IsPrimaryKey: true,
          IsRequired: true,
        },
        {
          Name: "Email",
          FieldType: "Email",
          MaxLength: 254,
          IsPrimaryKey: false,
          IsRequired: true,
        },
        {
          Name: "FirstName",
          FieldType: "Text",
          MaxLength: 100,
          IsPrimaryKey: false,
          IsRequired: false,
        },
      ];

      server.use(
        http.get("/api/metadata/fields", ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(mockFields);
        }),
      );

      const result = await getFields("my-data-extension-key");

      expect(capturedUrl).toContain("key=my-data-extension-key");
      expect(result).toEqual(mockFields);
      expect(result).toHaveLength(3);
    });

    it("returns system data view fields for _Sent", async () => {
      // This should NOT call the API - system data views are handled locally
      let apiCalled = false;

      server.use(
        http.get("/api/metadata/fields", () => {
          apiCalled = true;
          return HttpResponse.json([]);
        }),
      );

      const result = await getFields("_Sent");

      expect(apiCalled).toBe(false);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((f) => f.Name === "SubscriberKey")).toBe(true);
      expect(result.some((f) => f.Name === "EventDate")).toBe(true);
    });

    it("returns system data view fields for _Open", async () => {
      let apiCalled = false;

      server.use(
        http.get("/api/metadata/fields", () => {
          apiCalled = true;
          return HttpResponse.json([]);
        }),
      );

      const result = await getFields("_Open");

      expect(apiCalled).toBe(false);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((f) => f.Name === "IsUnique")).toBe(true);
    });

    it("returns system data view fields for ENT._Subscribers", async () => {
      let apiCalled = false;

      server.use(
        http.get("/api/metadata/fields", () => {
          apiCalled = true;
          return HttpResponse.json([]);
        }),
      );

      const result = await getFields("ENT._Subscribers");

      expect(apiCalled).toBe(false);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((f) => f.Name === "SubscriberID")).toBe(true);
    });

    it("fetches from API for non-system data view", async () => {
      let apiCalled = false;
      const mockFields: DataExtensionFieldResponseDto[] = [
        { Name: "CustomField", FieldType: "Text", MaxLength: 200 },
      ];

      server.use(
        http.get("/api/metadata/fields", () => {
          apiCalled = true;
          return HttpResponse.json(mockFields);
        }),
      );

      const result = await getFields("MyCustomDE");

      expect(apiCalled).toBe(true);
      expect(result).toEqual(mockFields);
    });

    it("returns empty array when DE has no fields", async () => {
      server.use(
        http.get("/api/metadata/fields", () => {
          return HttpResponse.json([]);
        }),
      );

      const result = await getFields("empty-de");

      expect(result).toEqual([]);
    });

    it("throws on 401 unauthorized for non-system data view", async () => {
      server.use(
        http.get("/api/metadata/fields", () => {
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }),
      );

      await expect(getFields("CustomDE")).rejects.toMatchObject({
        response: { status: 401 },
      });
    });

    it("throws on 404 when DE not found", async () => {
      server.use(
        http.get("/api/metadata/fields", () => {
          return HttpResponse.json(
            { error: "Data extension not found" },
            { status: 404 },
          );
        }),
      );

      await expect(getFields("nonexistent-de")).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });
});
