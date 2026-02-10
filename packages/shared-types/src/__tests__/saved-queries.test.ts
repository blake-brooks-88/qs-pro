import { describe, expect, it } from "vitest";

import {
  CreateSavedQuerySchema,
  SavedQueryListItemSchema,
  SavedQueryResponseSchema,
  UpdateSavedQuerySchema,
} from "../index";

describe("CreateSavedQuerySchema", () => {
  const valid = {
    name: "My Saved Query",
    sqlText: "SELECT Id FROM [Contact_Salesforce]",
  };

  it("accepts a valid payload", () => {
    const parsed = CreateSavedQuerySchema.parse(valid);
    expect(parsed.name).toBe("My Saved Query");
    expect(parsed.sqlText).toBe("SELECT Id FROM [Contact_Salesforce]");
  });

  it("rejects empty name", () => {
    const result = CreateSavedQuerySchema.safeParse({
      ...valid,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing sqlText", () => {
    const result = CreateSavedQuerySchema.safeParse({ name: "Test" });
    expect(result.success).toBe(false);
  });

  it("accepts null folderId", () => {
    const parsed = CreateSavedQuerySchema.parse({
      ...valid,
      folderId: null,
    });
    expect(parsed.folderId).toBeNull();
  });

  it("accepts a valid UUID folderId", () => {
    const parsed = CreateSavedQuerySchema.parse({
      ...valid,
      folderId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(parsed.folderId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejects non-UUID folderId", () => {
    const result = CreateSavedQuerySchema.safeParse({
      ...valid,
      folderId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateSavedQuerySchema", () => {
  it("accepts a valid partial update with name only", () => {
    const parsed = UpdateSavedQuerySchema.parse({ name: "Renamed" });
    expect(parsed.name).toBe("Renamed");
  });

  it("accepts a valid partial update with sqlText only", () => {
    const result = UpdateSavedQuerySchema.safeParse({
      sqlText: "SELECT 1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty object (all fields optional)", () => {
    const result = UpdateSavedQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts folderId as null", () => {
    const parsed = UpdateSavedQuerySchema.parse({ folderId: null });
    expect(parsed.folderId).toBeNull();
  });
});

describe("SavedQueryResponseSchema", () => {
  const validResponse = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "My Saved Query",
    sqlText: "SELECT Id FROM [Contact_Salesforce]",
    folderId: null,
    linkedQaObjectId: "obj-abc",
    linkedQaCustomerKey: "qa-key-01",
    linkedQaName: "My Query Activity",
    linkedAt: "2026-01-15T10:00:00Z",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-15T10:00:00Z",
  };

  it("accepts a valid full response with link fields populated", () => {
    const parsed = SavedQueryResponseSchema.parse(validResponse);
    expect(parsed.linkedQaObjectId).toBe("obj-abc");
    expect(parsed.linkedQaCustomerKey).toBe("qa-key-01");
    expect(parsed.linkedQaName).toBe("My Query Activity");
    expect(parsed.linkedAt).toBe("2026-01-15T10:00:00Z");
  });

  it("accepts nullable link fields as null", () => {
    const parsed = SavedQueryResponseSchema.parse({
      ...validResponse,
      linkedQaObjectId: null,
      linkedQaCustomerKey: null,
      linkedQaName: null,
      linkedAt: null,
    });
    expect(parsed.linkedQaObjectId).toBeNull();
    expect(parsed.linkedQaCustomerKey).toBeNull();
    expect(parsed.linkedQaName).toBeNull();
    expect(parsed.linkedAt).toBeNull();
  });

  it("rejects missing required fields", () => {
    const result = SavedQueryResponseSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });
});

describe("SavedQueryListItemSchema", () => {
  const validListItem = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "My Saved Query",
    folderId: null,
    linkedQaCustomerKey: "qa-key-01",
    linkedQaName: "My Query Activity",
    linkedAt: "2026-01-15T10:00:00Z",
    updatedAt: "2026-01-15T10:00:00Z",
  };

  it("accepts a valid list item with link fields", () => {
    const parsed = SavedQueryListItemSchema.parse(validListItem);
    expect(parsed.linkedQaCustomerKey).toBe("qa-key-01");
    expect(parsed.linkedQaName).toBe("My Query Activity");
  });

  it("accepts nullable link fields as null", () => {
    const parsed = SavedQueryListItemSchema.parse({
      ...validListItem,
      linkedQaCustomerKey: null,
      linkedQaName: null,
      linkedAt: null,
    });
    expect(parsed.linkedQaCustomerKey).toBeNull();
    expect(parsed.linkedQaName).toBeNull();
    expect(parsed.linkedAt).toBeNull();
  });
});
