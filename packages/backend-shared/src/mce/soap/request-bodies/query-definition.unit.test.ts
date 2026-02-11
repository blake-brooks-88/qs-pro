import { describe, expect, it } from "vitest";

import {
  buildCreateQueryDefinition,
  buildDeleteQueryDefinition,
  buildPerformQueryDefinition,
  buildRetrieveAllQueryDefinitions,
  buildRetrieveQueryDefinition,
  buildRetrieveQueryDefinitionByNameAndFolder,
  buildRetrieveQueryDefinitionDetail,
} from "./query-definition";

const VALID_QUERY_DEFINITION_PROPERTIES = [
  "ObjectID",
  "CustomerKey",
  "Name",
  "CategoryID",
  "QueryText",
  "TargetType",
  "DataExtensionTarget",
  "DataExtensionTarget.Name",
  "DataExtensionTarget.CustomerKey",
  "Description",
  "TargetUpdateType",
  "ModifiedDate",
  "Status",
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

function extractAllFilterValues(xml: string): string[] {
  const matches = xml.match(/<Value>([^<]*)<\/Value>/g);
  if (!matches) {
    return [];
  }
  return matches.map((m) => m.replace(/<\/?Value>/g, ""));
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

function extractDataExtensionTargetValue(
  xml: string,
  tagName: "CustomerKey" | "Name",
): string | null {
  const targetMatch = xml.match(
    /<DataExtensionTarget>[\s\S]*?<\/DataExtensionTarget>/,
  );
  if (!targetMatch) {
    return null;
  }

  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`);
  const match = targetMatch[0].match(regex);
  return match?.[1] ?? null;
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
  describe("buildRetrieveQueryDefinitionByNameAndFolder", () => {
    it("should be a Retrieve request for QueryDefinition", () => {
      const xml = buildRetrieveQueryDefinitionByNameAndFolder({
        name: "My Query",
      });

      expect(hasRequestType(xml, "Retrieve")).toBe(true);
      expect(extractObjectType(xml)).toBe("QueryDefinition");
    });

    it("should request ObjectID, CustomerKey, Name and CategoryID properties", () => {
      const xml = buildRetrieveQueryDefinitionByNameAndFolder({
        name: "My Query",
      });
      const requestedProps = extractRequestedProperties(xml);

      expect(requestedProps).toEqual([
        "ObjectID",
        "CustomerKey",
        "Name",
        "CategoryID",
      ]);
    });

    it("should build a SimpleFilterPart when categoryId is not provided", () => {
      const xml = buildRetrieveQueryDefinitionByNameAndFolder({
        name: "My Query",
      });

      expect(xml).toContain('xsi:type="SimpleFilterPart"');
      expect(xml).not.toContain("ComplexFilterPart");
      expect(xml).not.toContain("<LogicalOperator>");
      expect(extractFilterValue(xml)).toBe("My Query");
    });

    it("should build a ComplexFilterPart with AND when categoryId is provided", () => {
      const xml = buildRetrieveQueryDefinitionByNameAndFolder({
        name: "My Query",
        categoryId: 42,
      });

      expect(xml).toContain('xsi:type="ComplexFilterPart"');
      expect(xml).toContain("<LogicalOperator>AND</LogicalOperator>");

      const values = extractAllFilterValues(xml);
      expect(values).toContain("My Query");
      expect(values).toContain("42");
    });

    it("should filter by Name property in the SimpleFilterPart branch", () => {
      const xml = buildRetrieveQueryDefinitionByNameAndFolder({
        name: "Simple Query",
      });

      expect(xml).toContain("<Property>Name</Property>");
      expect(xml).toContain("<SimpleOperator>equals</SimpleOperator>");
      expect(extractFilterValue(xml)).toBe("Simple Query");
    });

    it("should filter by Name and CategoryID in the ComplexFilterPart branch", () => {
      const xml = buildRetrieveQueryDefinitionByNameAndFolder({
        name: "Complex Query",
        categoryId: 99,
      });

      expect(xml).toContain("<Property>Name</Property>");
      expect(xml).toContain("<Property>CategoryID</Property>");

      const values = extractAllFilterValues(xml);
      expect(values[0]).toBe("Complex Query");
      expect(values[1]).toBe("99");
    });

    it("should escape XML special characters in name", () => {
      const xml = buildRetrieveQueryDefinitionByNameAndFolder({
        name: "Query<>&\"'Test",
      });
      const filterValue = extractFilterValue(xml);

      expect(filterValue).toContain("&lt;");
      expect(filterValue).toContain("&gt;");
      expect(filterValue).toContain("&amp;");
      expect(filterValue).toContain("&quot;");
      expect(filterValue).toContain("&apos;");
    });

    it("should escape XML special characters in name within ComplexFilterPart", () => {
      const xml = buildRetrieveQueryDefinitionByNameAndFolder({
        name: "Name<>",
        categoryId: 10,
      });
      const values = extractAllFilterValues(xml);

      expect(values[0]).toContain("&lt;");
      expect(values[0]).toContain("&gt;");
    });
  });

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

    it("should include DataExtensionTarget name and customerKey for the target DE", () => {
      const xml = buildCreateQueryDefinition(defaultParams);

      expect(extractDataExtensionTargetValue(xml, "CustomerKey")).toBe(
        "target-de-key",
      );
      expect(extractDataExtensionTargetValue(xml, "Name")).toBe(
        "Target DE Name",
      );
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

    it("should omit CategoryID when categoryId is 0", () => {
      const xml = buildCreateQueryDefinition({
        ...defaultParams,
        categoryId: 0,
      });

      expect(xml).not.toContain("<CategoryID>");
    });

    it("should omit CategoryID when categoryId is undefined", () => {
      const xml = buildCreateQueryDefinition({
        ...defaultParams,
        categoryId: undefined,
      });

      expect(xml).not.toContain("<CategoryID>");
    });

    it("should use default description when not provided", () => {
      const xml = buildCreateQueryDefinition(defaultParams);

      expect(extractElementValue(xml, "Description")).toBe("Query++ execution");
    });

    it("should use explicit description when provided", () => {
      const xml = buildCreateQueryDefinition({
        ...defaultParams,
        description: "Custom description",
      });

      expect(extractElementValue(xml, "Description")).toBe(
        "Custom description",
      );
    });

    it("should use default targetUpdateType 'Overwrite' when not provided", () => {
      const xml = buildCreateQueryDefinition(defaultParams);

      expect(extractElementValue(xml, "TargetUpdateType")).toBe("Overwrite");
    });

    it("should use explicit targetUpdateType when provided", () => {
      const xml = buildCreateQueryDefinition({
        ...defaultParams,
        targetUpdateType: "Append",
      });

      expect(extractElementValue(xml, "TargetUpdateType")).toBe("Append");
    });

    it("should use 'Update' targetUpdateType when provided", () => {
      const xml = buildCreateQueryDefinition({
        ...defaultParams,
        targetUpdateType: "Update",
      });

      expect(extractElementValue(xml, "TargetUpdateType")).toBe("Update");
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

  describe("buildRetrieveAllQueryDefinitions", () => {
    it("should be a Retrieve request for QueryDefinition", () => {
      const xml = buildRetrieveAllQueryDefinitions();

      expect(hasRequestType(xml, "Retrieve")).toBe(true);
      expect(extractObjectType(xml)).toBe("QueryDefinition");
    });

    it("should request correct properties", () => {
      const xml = buildRetrieveAllQueryDefinitions();
      const requestedProps = extractRequestedProperties(xml);

      expect(requestedProps).toEqual([
        "ObjectID",
        "CustomerKey",
        "Name",
        "CategoryID",
        "TargetUpdateType",
        "ModifiedDate",
        "Status",
        "DataExtensionTarget.Name",
      ]);
    });

    it("should not include a Filter element", () => {
      const xml = buildRetrieveAllQueryDefinitions();

      expect(xml).not.toContain("<Filter");
    });

    it("should not request the invalid ID property", () => {
      const xml = buildRetrieveAllQueryDefinitions();
      const requestedProps = extractRequestedProperties(xml);

      expect(requestedProps).not.toContain("ID");
    });
  });

  describe("buildRetrieveQueryDefinitionDetail", () => {
    it("should be a Retrieve request for QueryDefinition", () => {
      const xml = buildRetrieveQueryDefinitionDetail("test-key");

      expect(hasRequestType(xml, "Retrieve")).toBe(true);
      expect(extractObjectType(xml)).toBe("QueryDefinition");
    });

    it("should request extended properties including target DE details", () => {
      const xml = buildRetrieveQueryDefinitionDetail("test-key");
      const requestedProps = extractRequestedProperties(xml);

      expect(requestedProps).toEqual([
        "ObjectID",
        "CustomerKey",
        "Name",
        "CategoryID",
        "QueryText",
        "TargetUpdateType",
        "DataExtensionTarget.Name",
        "DataExtensionTarget.CustomerKey",
        "ModifiedDate",
        "Status",
      ]);
    });

    it("should filter by customerKey", () => {
      const xml = buildRetrieveQueryDefinitionDetail("my-query-key");

      expect(extractFilterValue(xml)).toBe("my-query-key");
    });

    it("should escape XML special characters in customerKey", () => {
      const xml = buildRetrieveQueryDefinitionDetail("key<>&\"'test");
      const filterValue = extractFilterValue(xml);

      expect(filterValue).toContain("&lt;");
      expect(filterValue).toContain("&gt;");
      expect(filterValue).toContain("&amp;");
      expect(filterValue).toContain("&quot;");
      expect(filterValue).toContain("&apos;");
    });

    it("should not request the invalid ID property", () => {
      const xml = buildRetrieveQueryDefinitionDetail("test-key");
      const requestedProps = extractRequestedProperties(xml);

      expect(requestedProps).not.toContain("ID");
    });
  });
});
