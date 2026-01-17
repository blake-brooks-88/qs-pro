import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildTableAliasMap,
  containsSelectStar,
  expandSelectStar,
  extractTableNames,
  type MetadataFetcher,
  replaceStarInQuery,
  SelectStarExpansionError,
} from "./query-analyzer";
import { type ColumnDefinition, inferSchema } from "./schema-inferrer";

describe("Query Analyzer", () => {
  let mockMetadataFn: MetadataFetcher;

  beforeEach(() => {
    const tables = new Map<
      string,
      Array<{ Name: string; FieldType: string; MaxLength?: number }>
    >([
      [
        "DE",
        [
          { Name: "ID", FieldType: "Number" },
          { Name: "Name", FieldType: "Text", MaxLength: 100 },
          { Name: "Email", FieldType: "EmailAddress" },
          { Name: "CreatedDate", FieldType: "Date" },
        ],
      ],
      [
        "Customers",
        [
          { Name: "CustomerID", FieldType: "Number" },
          { Name: "FirstName", FieldType: "Text", MaxLength: 50 },
          { Name: "LastName", FieldType: "Text", MaxLength: 50 },
          { Name: "Email", FieldType: "EmailAddress" },
        ],
      ],
      [
        "Orders",
        [
          { Name: "OrderID", FieldType: "Number" },
          { Name: "CustomerID", FieldType: "Number" },
          { Name: "Amount", FieldType: "Decimal" },
          { Name: "OrderDate", FieldType: "Date" },
        ],
      ],
    ]);

    mockMetadataFn = {
      getFieldsForTable: vi.fn().mockImplementation((tableName: string) => {
        const normalizedName = tableName.replace(/^\[|\]$/g, "");
        return Promise.resolve(tables.get(normalizedName) ?? null);
      }),
    };
  });

  describe("expandSelectStar", () => {
    it("expands SELECT * FROM DE to explicit column list", async () => {
      // Arrange
      const sql = "SELECT * FROM DE";

      // Act
      const result = await expandSelectStar(sql, mockMetadataFn);

      // Assert
      expect(result).toContain("ID");
      expect(result).toContain("Name");
      expect(result).toContain("Email");
      expect(result).toContain("CreatedDate");
      expect(result).not.toContain("*");
    });

    it("expands SELECT a, * FROM DE correctly (preserves named columns)", async () => {
      // Arrange
      const sql = "SELECT ID, * FROM DE";

      // Act
      const result = await expandSelectStar(sql, mockMetadataFn);

      // Assert
      expect(result).toContain("ID");
      expect(result).toContain("Name");
      expect(result).not.toContain("SELECT ID, *");
    });

    it("resolves table alias (SELECT * FROM Customers c resolves c)", async () => {
      // Arrange
      const sql = "SELECT c.* FROM Customers AS c";

      // Act
      const result = await expandSelectStar(sql, mockMetadataFn);

      // Assert
      expect(result).toContain("CustomerID");
      expect(result).toContain("FirstName");
      expect(result).not.toContain("*");
    });

    it("returns query unchanged when no SELECT * is present", async () => {
      // Arrange
      const sql = "SELECT ID, Name FROM DE WHERE ID = 1";

      // Act
      const result = await expandSelectStar(sql, mockMetadataFn);

      // Assert
      expect(result).toBe(sql);
    });

    it("fails with clear error when SELECT * and metadata unavailable", async () => {
      // Arrange
      const sql = "SELECT * FROM UnknownTable";
      mockMetadataFn.getFieldsForTable = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(expandSelectStar(sql, mockMetadataFn)).rejects.toThrow(
        SelectStarExpansionError,
      );
      await expect(expandSelectStar(sql, mockMetadataFn)).rejects.toThrow(
        "Unable to expand SELECT *. Metadata unavailable for table UnknownTable",
      );
    });

    it("expands SELECT * FROM _Sent using hardcoded Data View schema", async () => {
      // Arrange
      const sql = "SELECT * FROM _Sent";

      // Act
      const result = await expandSelectStar(sql, mockMetadataFn);

      // Assert
      expect(result).toContain("AccountID");
      expect(result).toContain("JobID");
      expect(result).toContain("SubscriberKey");
      expect(result).toContain("EventDate");
      expect(result).not.toContain("*");
    });

    it("expands SELECT TOP 10 * FROM DE", async () => {
      // Arrange
      const sql = "SELECT TOP 10 * FROM DE";

      // Act
      const result = await expandSelectStar(sql, mockMetadataFn);

      // Assert
      expect(result).toContain("ID");
      expect(result).toContain("Name");
      expect(result).toContain("Email");
      expect(result).toContain("CreatedDate");
      expect(result).not.toContain("*");
      expect(result.toLowerCase()).toContain("top");
    });

    it("expands SELECT DISTINCT * FROM DE", async () => {
      // Arrange
      const sql = "SELECT DISTINCT * FROM DE";

      // Act
      const result = await expandSelectStar(sql, mockMetadataFn);

      // Assert
      expect(result).toContain("ID");
      expect(result).toContain("Name");
      expect(result).toContain("Email");
      expect(result).toContain("CreatedDate");
      expect(result).not.toContain("*");
      expect(result.toLowerCase()).toContain("distinct");
    });

    it("expands SELECT *, Name FROM DE", async () => {
      // Arrange
      const sql = "SELECT *, Name FROM DE";

      // Act
      const result = await expandSelectStar(sql, mockMetadataFn);

      // Assert
      expect(result).toContain("ID");
      expect(result).toContain("Email");
      expect(result).toContain("CreatedDate");
      expect(result).not.toContain("SELECT *,");
    });

    it("expands SELECT Name, * FROM DE", async () => {
      // Arrange
      const sql = "SELECT Name, * FROM DE";

      // Act
      const result = await expandSelectStar(sql, mockMetadataFn);

      // Assert
      expect(result).toContain("ID");
      expect(result).toContain("Email");
      expect(result).toContain("CreatedDate");
      expect(result).not.toContain(", *");
    });
  });

  describe("replaceStarInQuery", () => {
    it("replaces unqualified star with expanded columns", () => {
      // Arrange
      const sql = "SELECT * FROM DE";
      const expandedColumns = "ID, Name, Email";

      // Act
      const result = replaceStarInQuery(sql, expandedColumns, { table: null });

      // Assert
      expect(result).toContain("ID");
      expect(result).toContain("Name");
      expect(result).toContain("Email");
      expect(result).not.toContain("*");
    });

    it("replaces qualified star with table prefix", () => {
      // Arrange
      const sql = "SELECT t.* FROM DE AS t";
      const expandedColumns = "t.ID, t.Name, t.Email";

      // Act
      const result = replaceStarInQuery(sql, expandedColumns, { table: "t" });

      // Assert
      expect(result).toContain("ID");
      expect(result).toContain("Name");
      expect(result).toContain("Email");
      expect(result).not.toContain("*");
    });

    it("returns original SQL when star not found", () => {
      // Arrange
      const sql = "SELECT ID, Name FROM DE";
      const expandedColumns = "ID, Name, Email";

      // Act
      const result = replaceStarInQuery(sql, expandedColumns, { table: null });

      // Assert
      expect(result).toBe(sql);
    });
  });

  describe("containsSelectStar", () => {
    it("returns true for SELECT * queries", () => {
      expect(containsSelectStar("SELECT * FROM DE")).toBe(true);
      expect(containsSelectStar("SELECT t.* FROM DE AS t")).toBe(true);
    });

    it("returns false for queries without SELECT *", () => {
      expect(containsSelectStar("SELECT ID, Name FROM DE")).toBe(false);
      expect(containsSelectStar("SELECT COUNT(*) FROM DE")).toBe(false);
    });
  });

  describe("extractTableNames", () => {
    it("extracts table name from simple SELECT", () => {
      const result = extractTableNames("SELECT * FROM Customers");
      expect(result).toContain("Customers");
    });

    it("extracts multiple table names from JOIN", () => {
      const result = extractTableNames(
        "SELECT * FROM Customers c INNER JOIN Orders o ON c.ID = o.CustomerID",
      );
      expect(result).toContain("Customers");
      expect(result).toContain("Orders");
    });
  });

  describe("buildTableAliasMap", () => {
    it("builds alias map for table with AS clause", () => {
      const result = buildTableAliasMap("SELECT * FROM Customers AS c");
      expect(result.get("c")).toBe("Customers");
    });

    it("builds alias map for multiple tables", () => {
      const result = buildTableAliasMap(
        "SELECT * FROM Customers c JOIN Orders o ON c.ID = o.CustomerID",
      );
      expect(result.get("c")).toBe("Customers");
      expect(result.get("o")).toBe("Orders");
    });
  });
});

describe("Schema Inferrer", () => {
  let mockMetadataFn: MetadataFetcher;

  beforeEach(() => {
    const tables = new Map<
      string,
      Array<{ Name: string; FieldType: string; MaxLength?: number }>
    >([
      [
        "DE",
        [
          { Name: "ID", FieldType: "Number" },
          { Name: "Name", FieldType: "Text", MaxLength: 100 },
          { Name: "Amount", FieldType: "Decimal" },
        ],
      ],
      [
        "Customers",
        [
          { Name: "CustomerID", FieldType: "Number" },
          { Name: "Name", FieldType: "Text", MaxLength: 50 },
        ],
      ],
    ]);

    mockMetadataFn = {
      getFieldsForTable: vi.fn().mockImplementation((tableName: string) => {
        const normalizedName = tableName.replace(/^\[|\]$/g, "");
        return Promise.resolve(tables.get(normalizedName) ?? null);
      }),
    };
  });

  describe("inferSchema", () => {
    it("infers column type from metadata cache for direct columns", async () => {
      // Arrange
      const sql = "SELECT ID, Name FROM DE";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      expect(result).toHaveLength(2);
      const idCol = result.find((c: ColumnDefinition) => c.Name === "ID");
      const nameCol = result.find((c: ColumnDefinition) => c.Name === "Name");
      expect(idCol?.FieldType).toBe("Number");
      expect(nameCol?.FieldType).toBe("Text");
    });

    it("infers correct types for aggregate functions (COUNT->Number, AVG->Decimal)", async () => {
      // Arrange
      const sql = "SELECT COUNT(*) AS Total, AVG(Amount) AS AvgAmount FROM DE";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      const totalCol = result.find((c: ColumnDefinition) => c.Name === "Total");
      const avgCol = result.find(
        (c: ColumnDefinition) => c.Name === "AvgAmount",
      );
      expect(totalCol?.FieldType).toBe("Number");
      expect(avgCol?.FieldType).toBe("Decimal");
    });

    it("defaults unknown expressions to Text(254)", async () => {
      // Arrange - complex expression that cannot be fully parsed
      const sql = "SELECT NEWID() AS RandomID FROM DE";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      const randomCol = result.find(
        (c: ColumnDefinition) => c.Name === "RandomID",
      );
      expect(randomCol?.FieldType).toBe("Text");
      expect(randomCol?.MaxLength).toBe(4000); // Function returns Text with 4000
    });

    it("defaults to Text(254) when metadata unavailable for explicit columns", async () => {
      // Arrange
      mockMetadataFn.getFieldsForTable = vi.fn().mockResolvedValue(null);
      const sql = "SELECT UnknownColumn FROM UnknownTable";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      expect(result).toHaveLength(1);
      const firstCol = result[0];
      expect(firstCol).toBeDefined();
      expect(firstCol?.FieldType).toBe("Text");
      expect(firstCol?.MaxLength).toBe(254);
    });

    it("infers Data View fields with correct types (e.g., _Sent.JobID -> Number)", async () => {
      // Arrange
      const sql = "SELECT JobID, SubscriberKey, EventDate FROM _Sent";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      const jobIdCol = result.find((c: ColumnDefinition) => c.Name === "JobID");
      const subKeyCol = result.find(
        (c: ColumnDefinition) => c.Name === "SubscriberKey",
      );
      const eventDateCol = result.find(
        (c: ColumnDefinition) => c.Name === "EventDate",
      );

      expect(jobIdCol?.FieldType).toBe("Number");
      expect(subKeyCol?.FieldType).toBe("Text");
      expect(eventDateCol?.FieldType).toBe("Date");
    });

    it("truncates column names exceeding 50 chars to 45 chars with unique suffix", async () => {
      // Arrange
      const sql =
        "SELECT ID AS ThisIsAVeryLongColumnNameThatExceedsFiftyCharactersLimit FROM DE";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      expect(result).toHaveLength(1);
      const firstCol = result[0];
      expect(firstCol).toBeDefined();
      expect(firstCol?.Name.length).toBeLessThanOrEqual(50);
      expect(firstCol?.Name.length).toBe(45);
    });

    it("adds suffix to duplicate column names after truncation", async () => {
      // Arrange
      const sql = "SELECT ID AS DuplicateName, Name AS DuplicateName FROM DE";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      expect(result).toHaveLength(2);
      const names = result.map((c: ColumnDefinition) => c.Name);
      expect(names).toContain("DuplicateName");
      expect(names).toContain("DuplicateName_1");
    });

    it("infers string functions as Text", async () => {
      // Arrange
      const sql =
        "SELECT UPPER(Name) AS UpperName, CONCAT(Name, ID) AS Combined FROM DE";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      const upperCol = result.find(
        (c: ColumnDefinition) => c.Name === "UpperName",
      );
      const concatCol = result.find(
        (c: ColumnDefinition) => c.Name === "Combined",
      );
      expect(upperCol?.FieldType).toBe("Text");
      expect(concatCol?.FieldType).toBe("Text");
    });

    it("infers date functions correctly (GETDATE -> Date)", async () => {
      // Arrange
      const sql = "SELECT GETDATE() AS CurrentDate FROM DE";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      const dateCol = result.find(
        (c: ColumnDefinition) => c.Name === "CurrentDate",
      );
      expect(dateCol?.FieldType).toBe("Date");
    });

    it("infers CAST/CONVERT target types correctly", async () => {
      // Arrange
      const sql = "SELECT CAST(ID AS VARCHAR(50)) AS IDString FROM DE";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      const idStringCol = result.find(
        (c: ColumnDefinition) => c.Name === "IDString",
      );
      expect(idStringCol?.FieldType).toBe("Text");
    });
  });

  describe("Field Property Mapping", () => {
    it("applies MaxLength 254 for Text from direct column", async () => {
      // Arrange
      const sql = "SELECT Name FROM DE";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      const nameCol = result.find((c: ColumnDefinition) => c.Name === "Name");
      expect(nameCol?.MaxLength).toBeDefined();
    });

    it("applies MaxLength 4000 for Text from function", async () => {
      // Arrange
      const sql = "SELECT CONCAT(Name, Name) AS DoubleNameFromFunction FROM DE";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      const col = result.find(
        (c: ColumnDefinition) => c.Name === "DoubleNameFromFunction",
      );
      expect(col?.FieldType).toBe("Text");
      expect(col?.MaxLength).toBe(4000);
    });

    it("applies Scale and Precision for Decimal", async () => {
      // Arrange
      const sql = "SELECT AVG(Amount) AS AvgAmount FROM DE";

      // Act
      const result = await inferSchema(sql, mockMetadataFn);

      // Assert
      const avgCol = result.find(
        (c: ColumnDefinition) => c.Name === "AvgAmount",
      );
      expect(avgCol?.FieldType).toBe("Decimal");
      expect(avgCol?.Scale).toBe(2);
      expect(avgCol?.Precision).toBe(18);
    });
  });
});
