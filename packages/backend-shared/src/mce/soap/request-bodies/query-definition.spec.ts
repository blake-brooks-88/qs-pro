import { describe, expect, it } from "vitest";

import {
  buildCreateQueryDefinition,
  buildDeleteQueryDefinition,
  buildPerformQueryDefinition,
  buildRetrieveQueryDefinition,
} from "./query-definition";

const VALID_QUERY_DEFINITION_PROPERTIES = [
  "ObjectID",
  "CustomerKey",
  "Name",
  "CategoryID",
  "QueryText",
  "TargetType",
  "DataExtensionTarget",
  "Description",
  "TargetUpdateType",
];

function extractRequestedProperties(xml: string): string[] {
  const matches = xml.match(/<Properties>([^<]+)<\/Properties>/g);
  if (!matches) {
    return [];
  }
  return matches.map((m) => m.replace(/<\/?Properties>/g, ""));
}

function extractFilterValue(xml: string): string | null {
  const match = xml.match(/<Value>([^<]*)<\/Value>/);
  return match?.[1] ?? null;
}

function extractObjectType(xml: string): string | null {
  const match = xml.match(/<ObjectType>([^<]+)<\/ObjectType>/);
  return match?.[1] ?? null;
}

function extractElementValue(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`);
  const match = xml.match(regex);
  return match?.[1] ?? null;
}

function extractObjectIdFromDefinition(xml: string): string | null {
  const definitionMatch = xml.match(
    /<Definition[^>]*>[\s\S]*?<ObjectID>([^<]*)<\/ObjectID>[\s\S]*?<\/Definition>/,
  );
  return definitionMatch?.[1] ?? null;
}

function extractObjectIdFromObjects(xml: string): string | null {
  const objectsMatch = xml.match(
    /<Objects[^>]*>[\s\S]*?<ObjectID>([^<]*)<\/ObjectID>[\s\S]*?<\/Objects>/,
  );
  return objectsMatch?.[1] ?? null;
}

function hasRequestType(xml: string, type: string): boolean {
  const patterns: Record<string, RegExp> = {
    Retrieve: /<RetrieveRequest/,
    Create: /<CreateRequest/,
    Delete: /<DeleteRequest/,
    Perform: /<PerformRequestMsg/,
  };
  return patterns[type]?.test(xml) ?? false;
}

describe("QueryDefinition SOAP Request Builders", () => {
  describe("buildRetrieveQueryDefinition", () => {
    it("should be a Retrieve request for QueryDefinition", () => {
      const xml = buildRetrieveQueryDefinition("test-key");

      expect(hasRequestType(xml, "Retrieve")).toBe(true);
      expect(extractObjectType(xml)).toBe("QueryDefinition");
    });

    it("should only request valid QueryDefinition properties", () => {
      const xml = buildRetrieveQueryDefinition("test-key");
      const requestedProps = extractRequestedProperties(xml);

      expect(requestedProps.length).toBeGreaterThan(0);
      for (const prop of requestedProps) {
        expect(VALID_QUERY_DEFINITION_PROPERTIES).toContain(prop);
      }
    });

    it("should not request the invalid ID property", () => {
      const xml = buildRetrieveQueryDefinition("test-key");
      const requestedProps = extractRequestedProperties(xml);

      expect(requestedProps).not.toContain("ID");
    });

    it("should filter by the provided customerKey", () => {
      const xml = buildRetrieveQueryDefinition("my-query-key");

      expect(extractFilterValue(xml)).toBe("my-query-key");
    });

    it("should escape XML special characters in customerKey", () => {
      const xml = buildRetrieveQueryDefinition("key<>&\"'test");
      const filterValue = extractFilterValue(xml);

      expect(filterValue).toContain("&lt;");
      expect(filterValue).toContain("&gt;");
      expect(filterValue).toContain("&amp;");
      expect(filterValue).toContain("&quot;");
      expect(filterValue).toContain("&apos;");
    });
  });

  describe("buildCreateQueryDefinition", () => {
    const defaultParams = {
      name: "Test Query",
      customerKey: "test-key",
      categoryId: 123,
      targetId: "target-object-id",
      targetCustomerKey: "target-de-key",
      targetName: "Target DE Name",
      queryText: "SELECT * FROM DataExtension",
    };

    it("should be a Create request", () => {
      const xml = buildCreateQueryDefinition(defaultParams);

      expect(hasRequestType(xml, "Create")).toBe(true);
    });

    it("should include required fields with correct values", () => {
      const xml = buildCreateQueryDefinition(defaultParams);

      expect(extractElementValue(xml, "Name")).toBe("Test Query");
      expect(extractElementValue(xml, "CustomerKey")).toBe("test-key");
      expect(extractElementValue(xml, "QueryText")).toBe(
        "SELECT * FROM DataExtension",
      );
      expect(extractElementValue(xml, "CategoryID")).toBe("123");
    });

    it("should include DataExtensionTarget with targetId as ObjectID", () => {
      const xml = buildCreateQueryDefinition(defaultParams);

      expect(extractObjectIdFromObjects(xml)).toBe("target-object-id");
    });

    it("should escape XML special characters in all user inputs", () => {
      const xml = buildCreateQueryDefinition({
        name: "Name<>",
        customerKey: "key&test",
        categoryId: 123,
        targetId: 'id"test',
        targetCustomerKey: "target-key",
        targetName: "target-name",
        queryText: "SELECT * WHERE x < 10",
      });

      expect(xml).toContain("&lt;");
      expect(xml).toContain("&gt;");
      expect(xml).toContain("&amp;");
      expect(xml).toContain("&quot;");
    });
  });

  describe("buildPerformQueryDefinition", () => {
    it("should be a Perform request with Start action", () => {
      const xml = buildPerformQueryDefinition("test-object-id");

      expect(hasRequestType(xml, "Perform")).toBe(true);
      expect(extractElementValue(xml, "Action")).toBe("Start");
    });

    it("should include the objectId in the Definition", () => {
      const xml = buildPerformQueryDefinition("test-object-id");

      expect(extractObjectIdFromDefinition(xml)).toBe("test-object-id");
    });

    it("should escape XML special characters in objectId", () => {
      const xml = buildPerformQueryDefinition("id<>&\"'");
      const objectId = extractObjectIdFromDefinition(xml);

      expect(objectId).toContain("&lt;");
      expect(objectId).toContain("&gt;");
      expect(objectId).toContain("&amp;");
    });
  });

  describe("buildDeleteQueryDefinition", () => {
    it("should be a Delete request", () => {
      const xml = buildDeleteQueryDefinition("test-object-id");

      expect(hasRequestType(xml, "Delete")).toBe(true);
    });

    it("should include the objectId for deletion", () => {
      const xml = buildDeleteQueryDefinition("test-object-id");

      expect(extractObjectIdFromObjects(xml)).toBe("test-object-id");
    });

    it("should escape XML special characters in objectId", () => {
      const xml = buildDeleteQueryDefinition("id<>&\"'");
      const objectId = extractObjectIdFromObjects(xml);

      expect(objectId).toContain("&lt;");
      expect(objectId).toContain("&gt;");
      expect(objectId).toContain("&amp;");
    });
  });
});
