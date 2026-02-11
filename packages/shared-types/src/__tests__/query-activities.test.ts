import { describe, expect, it } from "vitest";

import {
  CreateQueryActivitySchema,
  LinkQueryRequestSchema,
  LinkQueryResponseSchema,
  QADetailSchema,
  QAListItemSchema,
} from "../index";

describe("CreateQueryActivitySchema", () => {
  const validMinimal = {
    name: "My Query",
    targetDataExtensionCustomerKey: "target-de-key",
    queryText: "SELECT 1",
  };

  const validFull = {
    name: "My Query",
    customerKey: "my-query-key_01",
    description: "A description of the query",
    categoryId: 42,
    targetDataExtensionCustomerKey: "target-de-key",
    targetDataExtensionEid: "12345",
    queryText: "SELECT Name FROM [Contact_Salesforce]",
    targetUpdateType: "Append" as const,
  };

  it("accepts a valid minimal payload", () => {
    const parsed = CreateQueryActivitySchema.parse(validMinimal);
    expect(parsed.name).toBe("My Query");
    expect(parsed.targetUpdateType).toBe("Overwrite");
  });

  it("accepts a valid full payload with all optional fields", () => {
    const parsed = CreateQueryActivitySchema.parse(validFull);
    expect(parsed.customerKey).toBe("my-query-key_01");
    expect(parsed.description).toBe("A description of the query");
    expect(parsed.categoryId).toBe(42);
    expect(parsed.targetDataExtensionEid).toBe("12345");
    expect(parsed.targetUpdateType).toBe("Append");
  });

  it("rejects missing name", () => {
    const { name: _, ...noName } = validMinimal;
    const result = CreateQueryActivitySchema.safeParse(noName);
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 200 characters", () => {
    const result = CreateQueryActivitySchema.safeParse({
      ...validMinimal,
      name: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects customerKey with invalid characters", () => {
    const result = CreateQueryActivitySchema.safeParse({
      ...validMinimal,
      customerKey: "invalid key!@#",
    });
    expect(result.success).toBe(false);
  });

  it("rejects queryText longer than 100,000 characters", () => {
    const result = CreateQueryActivitySchema.safeParse({
      ...validMinimal,
      queryText: "S".repeat(100_001),
    });
    expect(result.success).toBe(false);
  });

  it("validates targetUpdateType enum values", () => {
    for (const valid of ["Overwrite", "Append", "Update"]) {
      const result = CreateQueryActivitySchema.safeParse({
        ...validMinimal,
        targetUpdateType: valid,
      });
      expect(result.success).toBe(true);
    }

    const result = CreateQueryActivitySchema.safeParse({
      ...validMinimal,
      targetUpdateType: "Delete",
    });
    expect(result.success).toBe(false);
  });
});

describe("QAListItemSchema", () => {
  const validItem = {
    objectId: "abc-123",
    customerKey: "qa-key-01",
    name: "My QA",
    categoryId: 10,
    targetUpdateType: "Overwrite",
    modifiedDate: "2026-01-15T10:00:00Z",
    status: "Active",
    isLinked: true,
    linkedToQueryName: "Saved Query A",
  };

  it("accepts a valid item with all fields", () => {
    const parsed = QAListItemSchema.parse(validItem);
    expect(parsed.objectId).toBe("abc-123");
    expect(parsed.isLinked).toBe(true);
    expect(parsed.linkedToQueryName).toBe("Saved Query A");
  });

  it("accepts targetDEName as optional string", () => {
    const parsed = QAListItemSchema.parse({
      ...validItem,
      targetDEName: "Subscriber_Weekly",
    });
    expect(parsed.targetDEName).toBe("Subscriber_Weekly");
  });

  it("accepts item without targetDEName (optional field)", () => {
    const { targetDEName: _, ...noTargetDEName } = validItem as Record<
      string,
      unknown
    >;
    const parsed = QAListItemSchema.parse(noTargetDEName);
    expect(parsed.targetDEName).toBeUndefined();
  });

  it("accepts isLinked as false", () => {
    const parsed = QAListItemSchema.parse({
      ...validItem,
      isLinked: false,
    });
    expect(parsed.isLinked).toBe(false);
  });

  it("accepts linkedToQueryName as null", () => {
    const parsed = QAListItemSchema.parse({
      ...validItem,
      linkedToQueryName: null,
    });
    expect(parsed.linkedToQueryName).toBeNull();
  });
});

describe("QADetailSchema", () => {
  const validDetail = {
    objectId: "abc-123",
    customerKey: "qa-key-01",
    name: "My QA",
    isLinked: false,
    linkedToQueryName: null,
    queryText: "SELECT Id FROM [Contact_Salesforce]",
    targetDEName: "TargetDE",
    targetDECustomerKey: "target-de-key",
  };

  it("extends QAListItemSchema with queryText and target DE fields", () => {
    const parsed = QADetailSchema.parse(validDetail);
    expect(parsed.queryText).toBe("SELECT Id FROM [Contact_Salesforce]");
    expect(parsed.targetDEName).toBe("TargetDE");
    expect(parsed.targetDECustomerKey).toBe("target-de-key");
  });

  it("rejects when queryText is missing", () => {
    const { queryText: _, ...noQueryText } = validDetail;
    const result = QADetailSchema.safeParse(noQueryText);
    expect(result.success).toBe(false);
  });
});

describe("LinkQueryRequestSchema", () => {
  it("accepts valid payload with qaCustomerKey only", () => {
    const parsed = LinkQueryRequestSchema.parse({
      qaCustomerKey: "qa-key-01",
    });
    expect(parsed.qaCustomerKey).toBe("qa-key-01");
    expect(parsed.conflictResolution).toBeUndefined();
  });

  it("accepts valid payload with conflictResolution", () => {
    const parsed = LinkQueryRequestSchema.parse({
      qaCustomerKey: "qa-key-01",
      conflictResolution: "keep-local",
    });
    expect(parsed.conflictResolution).toBe("keep-local");
  });

  it("accepts keep-remote conflictResolution", () => {
    const result = LinkQueryRequestSchema.safeParse({
      qaCustomerKey: "qa-key-01",
      conflictResolution: "keep-remote",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty qaCustomerKey", () => {
    const result = LinkQueryRequestSchema.safeParse({
      qaCustomerKey: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid conflictResolution value", () => {
    const result = LinkQueryRequestSchema.safeParse({
      qaCustomerKey: "qa-key-01",
      conflictResolution: "keep-both",
    });
    expect(result.success).toBe(false);
  });
});

describe("LinkQueryResponseSchema", () => {
  const validResponse = {
    linkedQaObjectId: "obj-123",
    linkedQaCustomerKey: "qa-key-01",
    linkedQaName: "My QA",
    linkedAt: "2026-01-15T10:00:00Z",
    sqlUpdated: false,
  };

  it("accepts a valid response", () => {
    const parsed = LinkQueryResponseSchema.parse(validResponse);
    expect(parsed.linkedQaObjectId).toBe("obj-123");
    expect(parsed.linkedQaCustomerKey).toBe("qa-key-01");
    expect(parsed.linkedQaName).toBe("My QA");
    expect(parsed.linkedAt).toBe("2026-01-15T10:00:00Z");
    expect(parsed.sqlUpdated).toBe(false);
  });

  it("requires all fields", () => {
    const requiredFields = [
      "linkedQaObjectId",
      "linkedQaCustomerKey",
      "linkedQaName",
      "linkedAt",
      "sqlUpdated",
    ];

    for (const field of requiredFields) {
      const partial = { ...validResponse };
      delete partial[field as keyof typeof partial];
      const result = LinkQueryResponseSchema.safeParse(partial);
      expect(result.success).toBe(false);
    }
  });
});
