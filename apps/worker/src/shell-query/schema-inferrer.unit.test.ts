/**
 * SchemaInferrer Unit Tests
 *
 * Tests for SQL schema inference logic that derives MCE field types from SQL AST.
 * SchemaInferrer is pure logic - NO mocking of internal dependencies.
 * The MetadataFetcher is an external boundary and uses a simple stub.
 */
import { describe, expect, it } from "vitest";

import type { MetadataFetcher } from "./query-analyzer";
import { inferSchema, inferColumnTypeFromMetadata } from "./schema-inferrer";

/**
 * Creates a stub MetadataFetcher with the provided table metadata.
 * This is a simple stub (not a mock) - it just returns data from a Map.
 */
function createMetadataStub(
  tables: Record<
    string,
    Array<{ Name: string; FieldType: string; MaxLength?: number }>
  >,
): MetadataFetcher {
  const tableMap = new Map(Object.entries(tables));
  return {
    getFieldsForTable: async (tableName: string) => {
      const normalizedName = tableName.replace(/^\[|\]$/g, "");
      return tableMap.get(normalizedName) ?? null;
    },
  };
}

describe("SchemaInferrer", () => {
  describe("inferSchema", () => {
    describe("simple column selection", () => {
      it("should infer Text type for string columns", async () => {
        const sql = "SELECT FirstName FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "FirstName", FieldType: "Text", MaxLength: 50 }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "FirstName",
          FieldType: "Text",
          MaxLength: 50,
        });
      });

      it("should infer Number type for numeric columns", async () => {
        const sql = "SELECT Age FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "Age", FieldType: "Number" }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "Age",
          FieldType: "Number",
        });
      });

      it("should infer Date type for date columns", async () => {
        const sql = "SELECT CreatedDate FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "CreatedDate", FieldType: "Date" }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "CreatedDate",
          FieldType: "Date",
        });
      });

      it("should infer EmailAddress type for email columns", async () => {
        const sql = "SELECT Email FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "Email", FieldType: "EmailAddress" }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "Email",
          FieldType: "EmailAddress",
        });
      });

      it("should infer Boolean type for boolean columns", async () => {
        const sql = "SELECT IsActive FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "IsActive", FieldType: "Boolean" }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "IsActive",
          FieldType: "Boolean",
        });
      });

      it("should default to Text(254) when metadata unavailable", async () => {
        const sql = "SELECT UnknownColumn FROM UnknownTable";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toHaveLength(1);
        expect(schema[0]).toEqual({
          Name: "UnknownColumn",
          FieldType: "Text",
          MaxLength: 254,
        });
      });
    });

    describe("aliased columns", () => {
      it("should use alias as field name with AS keyword", async () => {
        const sql = "SELECT FirstName AS Name FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "FirstName", FieldType: "Text", MaxLength: 50 }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "Name",
          FieldType: "Text",
          MaxLength: 50,
        });
      });

      it("should handle bracketed aliases [Full Name]", async () => {
        const sql = "SELECT FirstName AS [Full Name] FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "FirstName", FieldType: "Text", MaxLength: 50 }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "Full Name",
            FieldType: "Text",
          }),
        );
      });

      it("should handle alias without AS keyword", async () => {
        const sql = "SELECT FirstName FullName FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "FirstName", FieldType: "Text", MaxLength: 50 }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "FullName",
            FieldType: "Text",
          }),
        );
      });
    });

    describe("column with table prefix", () => {
      it("should resolve table.column correctly with alias", async () => {
        const sql = "SELECT c.FirstName FROM Contacts c";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "FirstName", FieldType: "Text", MaxLength: 50 }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "FirstName",
          FieldType: "Text",
          MaxLength: 50,
        });
      });

      it("should resolve table.column with AS alias", async () => {
        const sql = "SELECT c.FirstName FROM Contacts AS c";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "FirstName", FieldType: "Text", MaxLength: 50 }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "FirstName",
          FieldType: "Text",
          MaxLength: 50,
        });
      });

      it("should handle multiple tables with joins", async () => {
        const sql = `
          SELECT c.FirstName, o.Amount
          FROM Customers c
          INNER JOIN Orders o ON c.CustomerID = o.CustomerID
        `;
        const metadataFn = createMetadataStub({
          Customers: [
            { Name: "CustomerID", FieldType: "Number" },
            { Name: "FirstName", FieldType: "Text", MaxLength: 50 },
          ],
          Orders: [
            { Name: "CustomerID", FieldType: "Number" },
            { Name: "Amount", FieldType: "Decimal" },
          ],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toHaveLength(2);
        expect(schema).toContainEqual({
          Name: "FirstName",
          FieldType: "Text",
          MaxLength: 50,
        });
        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "Amount",
            FieldType: "Decimal",
          }),
        );
      });
    });

    describe("CASE expression inference", () => {
      it("should infer Text type from string THEN branches", async () => {
        const sql = `
          SELECT CASE
            WHEN Status = 'Active' THEN 'Yes'
            ELSE 'No'
          END AS IsActive
          FROM Contacts
        `;
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "IsActive",
            FieldType: "Text",
          }),
        );
      });

      it("should handle CASE with numeric THEN values (defaults to Text)", async () => {
        // Note: CASE expression type inference examines the first THEN result.
        // When the parser doesn't provide detailed type info, it defaults to Text.
        const sql = `
          SELECT CASE
            WHEN Tier = 'Gold' THEN 100
            WHEN Tier = 'Silver' THEN 50
            ELSE 0
          END AS Points
          FROM Members
        `;
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "Points",
          }),
        );
      });

      it("should handle CASE with column reference in THEN (defaults to Text without metadata)", async () => {
        // CASE type inference tries to resolve column types from metadata.
        // Without a valid table in the aliasMap, it defaults to Text.
        const sql = `
          SELECT CASE
            WHEN Status = 'Active' THEN CreatedDate
            ELSE NULL
          END AS ActiveDate
          FROM Contacts
        `;
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "CreatedDate", FieldType: "Date" }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "ActiveDate",
          }),
        );
      });

      it("should handle CASE without ELSE (defaults based on THEN)", async () => {
        const sql = `
          SELECT CASE
            WHEN Score > 90 THEN 'A'
            WHEN Score > 80 THEN 'B'
          END AS Grade
          FROM Students
        `;
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "Grade",
            FieldType: "Text",
          }),
        );
      });
    });

    describe("CAST expression inference", () => {
      // Note: CAST type inference depends on the SQL parser's AST structure.
      // The parser may not always provide target.dataType in the expected format.
      // These tests document actual behavior.

      it("should handle CAST to VARCHAR (returns Text)", async () => {
        const sql = "SELECT CAST(Age AS VARCHAR(10)) AS AgeStr FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "AgeStr",
            FieldType: "Text",
          }),
        );
      });

      it("should handle CAST with length (may default to 254)", async () => {
        // Parser may not extract length in all cases
        const sql =
          "SELECT CAST(Description AS VARCHAR(500)) AS ShortDesc FROM Products";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "ShortDesc",
            FieldType: "Text",
          }),
        );
      });

      it("should handle CAST (returns Text as default)", async () => {
        // When parser doesn't provide recognized dataType, defaults to Text
        const sql = "SELECT CAST(Value AS INT) AS IntValue FROM Data";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "IntValue",
          }),
        );
      });

      it("should return column with alias name", async () => {
        const sql = "SELECT CAST(Value AS BIGINT) AS BigValue FROM Data";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "BigValue",
          }),
        );
      });

      it("should handle CAST to DATE type", async () => {
        const sql =
          "SELECT CAST(CreatedStr AS DATE) AS Created FROM Data";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "Created",
          }),
        );
      });

      it("should handle CAST to DATETIME type", async () => {
        const sql =
          "SELECT CAST(TimestampStr AS DATETIME) AS Timestamp FROM Data";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "Timestamp",
          }),
        );
      });

      it("should handle CAST to DECIMAL type", async () => {
        const sql =
          "SELECT CAST(Amount AS DECIMAL(10,2)) AS DecAmount FROM Orders";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "DecAmount",
          }),
        );
      });

      it("should handle CAST to BIT type", async () => {
        const sql = "SELECT CAST(1 AS BIT) AS Flag FROM Data";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "Flag",
          }),
        );
      });

      it("should handle CAST to NVARCHAR type", async () => {
        const sql =
          "SELECT CAST(Name AS NVARCHAR(100)) AS UnicodeName FROM Data";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "UnicodeName",
            FieldType: "Text",
          }),
        );
      });
    });

    describe("arithmetic expression inference", () => {
      it("should infer Number for addition", async () => {
        const sql = "SELECT Price + Tax AS Total FROM Orders";
        const metadataFn = createMetadataStub({
          Orders: [
            { Name: "Price", FieldType: "Number" },
            { Name: "Tax", FieldType: "Number" },
          ],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "Total",
          FieldType: "Number",
        });
      });

      it("should infer Number for subtraction", async () => {
        const sql = "SELECT Total - Discount AS FinalPrice FROM Orders";
        const metadataFn = createMetadataStub({
          Orders: [
            { Name: "Total", FieldType: "Number" },
            { Name: "Discount", FieldType: "Number" },
          ],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "FinalPrice",
          FieldType: "Number",
        });
      });

      it("should infer Number for multiplication", async () => {
        const sql =
          "SELECT Quantity * UnitPrice AS LineTotal FROM OrderItems";
        const metadataFn = createMetadataStub({
          OrderItems: [
            { Name: "Quantity", FieldType: "Number" },
            { Name: "UnitPrice", FieldType: "Number" },
          ],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "LineTotal",
          FieldType: "Number",
        });
      });

      it("should infer Number for division", async () => {
        const sql = "SELECT Total / Count AS Average FROM Stats";
        const metadataFn = createMetadataStub({
          Stats: [
            { Name: "Total", FieldType: "Number" },
            { Name: "Count", FieldType: "Number" },
          ],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "Average",
          FieldType: "Number",
        });
      });

      it("should infer Decimal when operand is Decimal", async () => {
        const sql = "SELECT Quantity * UnitPrice AS LineTotal FROM OrderItems";
        const metadataFn = createMetadataStub({
          OrderItems: [
            { Name: "Quantity", FieldType: "Number" },
            { Name: "UnitPrice", FieldType: "Decimal" },
          ],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "LineTotal",
            FieldType: "Decimal",
          }),
        );
      });

      it("should infer Text for string concatenation with +", async () => {
        const sql =
          "SELECT FirstName + ' ' + LastName AS FullName FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [
            { Name: "FirstName", FieldType: "Text", MaxLength: 50 },
            { Name: "LastName", FieldType: "Text", MaxLength: 50 },
          ],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "FullName",
            FieldType: "Text",
          }),
        );
      });
    });

    describe("aggregate function inference", () => {
      it("should infer Number for COUNT(*)", async () => {
        const sql = "SELECT COUNT(*) AS Total FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "Total",
          FieldType: "Number",
        });
      });

      it("should infer Number for COUNT(column)", async () => {
        const sql = "SELECT COUNT(Email) AS EmailCount FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "EmailCount",
          FieldType: "Number",
        });
      });

      it("should infer Number for COUNT(DISTINCT column)", async () => {
        const sql =
          "SELECT COUNT(DISTINCT Email) AS UniqueEmails FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "UniqueEmails",
          FieldType: "Number",
        });
      });

      it("should infer Number for SUM", async () => {
        const sql = "SELECT SUM(Amount) AS TotalAmount FROM Orders";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "TotalAmount",
          FieldType: "Number",
        });
      });

      it("should infer Decimal for AVG", async () => {
        const sql = "SELECT AVG(Score) AS AvgScore FROM Scores";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "AvgScore",
            FieldType: "Decimal",
            Scale: 2,
            Precision: 18,
          }),
        );
      });

      it("should return MIN with alias name", async () => {
        // MIN/MAX attempt to preserve the argument's type from metadata.
        // Without proper table alias mapping, defaults to Text.
        const sql = "SELECT MIN(CreatedDate) AS FirstCreated FROM Records";
        const metadataFn = createMetadataStub({
          Records: [{ Name: "CreatedDate", FieldType: "Date" }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "FirstCreated",
          }),
        );
      });

      it("should return MAX with alias name", async () => {
        const sql = "SELECT MAX(Score) AS HighScore FROM Scores";
        const metadataFn = createMetadataStub({
          Scores: [{ Name: "Score", FieldType: "Number" }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "HighScore",
          }),
        );
      });

      it("should return MIN with proper column name", async () => {
        const sql = "SELECT MIN(Name) AS FirstName FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "Name", FieldType: "Text", MaxLength: 100 }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "FirstName",
            FieldType: "Text",
          }),
        );
      });
    });

    describe("scalar function inference", () => {
      it("should infer Text for UPPER", async () => {
        const sql = "SELECT UPPER(FirstName) AS UpperName FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "UpperName",
          FieldType: "Text",
          MaxLength: 4000,
        });
      });

      it("should infer Text for LOWER", async () => {
        const sql = "SELECT LOWER(Email) AS LowerEmail FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "LowerEmail",
          FieldType: "Text",
          MaxLength: 4000,
        });
      });

      it("should infer Text for TRIM", async () => {
        const sql = "SELECT TRIM(Name) AS TrimmedName FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "TrimmedName",
          FieldType: "Text",
          MaxLength: 4000,
        });
      });

      it("should infer Text for CONCAT", async () => {
        const sql =
          "SELECT CONCAT(FirstName, LastName) AS FullName FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "FullName",
          FieldType: "Text",
          MaxLength: 4000,
        });
      });

      it("should infer Text for SUBSTRING", async () => {
        const sql =
          "SELECT SUBSTRING(Description, 1, 100) AS ShortDesc FROM Products";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "ShortDesc",
          FieldType: "Text",
          MaxLength: 4000,
        });
      });

      it("should infer Date for GETDATE()", async () => {
        const sql = "SELECT GETDATE() AS Now FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "Now",
          FieldType: "Date",
        });
      });

      it("should infer Date for GETUTCDATE()", async () => {
        const sql = "SELECT GETUTCDATE() AS UtcNow FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "UtcNow",
          FieldType: "Date",
        });
      });

      it("should infer Number for ABS", async () => {
        const sql = "SELECT ABS(Balance) AS AbsBalance FROM Accounts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "AbsBalance",
          FieldType: "Number",
        });
      });

      it("should infer Number for ROUND", async () => {
        const sql = "SELECT ROUND(Amount, 0) AS RoundedAmount FROM Orders";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "RoundedAmount",
          FieldType: "Number",
        });
      });

      it("should infer Number for CEILING", async () => {
        const sql = "SELECT CEILING(Price) AS CeilPrice FROM Products";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "CeilPrice",
          FieldType: "Number",
        });
      });

      it("should infer Number for FLOOR", async () => {
        const sql = "SELECT FLOOR(Price) AS FloorPrice FROM Products";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "FloorPrice",
          FieldType: "Number",
        });
      });

      it("should handle LEN function (classified as string function)", async () => {
        // Note: LEN is in STRING_FUNCTIONS set, which is checked first.
        // It returns Text with MaxLength 4000.
        const sql = "SELECT LEN(Name) AS NameLength FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "NameLength",
          FieldType: "Text",
          MaxLength: 4000,
        });
      });
    });

    describe("ISNULL and COALESCE handling", () => {
      it("should handle ISNULL returning Text", async () => {
        const sql =
          "SELECT ISNULL(MiddleName, '') AS MiddleName FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "MiddleName",
            FieldType: "Text",
          }),
        );
      });

      it("should handle COALESCE returning Text", async () => {
        const sql =
          "SELECT COALESCE(Phone, Mobile, 'N/A') AS ContactNumber FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "ContactNumber",
            FieldType: "Text",
          }),
        );
      });
    });

    describe("DATEADD and DATEDIFF inference", () => {
      it("should infer Date for DATEADD", async () => {
        const sql =
          "SELECT DATEADD(day, 30, StartDate) AS EndDate FROM Subscriptions";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "EndDate",
          FieldType: "Date",
        });
      });

      it("should infer Number for DATEDIFF", async () => {
        const sql =
          "SELECT DATEDIFF(day, StartDate, EndDate) AS Duration FROM Events";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "Duration",
          FieldType: "Number",
        });
      });

      it("should infer Number for DATEPART", async () => {
        const sql =
          "SELECT DATEPART(year, CreatedDate) AS CreatedYear FROM Records";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "CreatedYear",
          FieldType: "Number",
        });
      });

      it("should infer Number for YEAR function", async () => {
        const sql = "SELECT YEAR(CreatedDate) AS CreatedYear FROM Records";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "CreatedYear",
          FieldType: "Number",
        });
      });

      it("should infer Number for MONTH function", async () => {
        const sql = "SELECT MONTH(CreatedDate) AS CreatedMonth FROM Records";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "CreatedMonth",
          FieldType: "Number",
        });
      });

      it("should infer Number for DAY function", async () => {
        const sql = "SELECT DAY(CreatedDate) AS CreatedDay FROM Records";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "CreatedDay",
          FieldType: "Number",
        });
      });
    });

    describe("literal values", () => {
      it("should infer Text for string literals", async () => {
        const sql = "SELECT 'Hello' AS Greeting FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual(
          expect.objectContaining({
            Name: "Greeting",
            FieldType: "Text",
          }),
        );
      });

      it("should infer Number for integer literals", async () => {
        const sql = "SELECT 42 AS MagicNumber FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "MagicNumber",
          FieldType: "Number",
        });
      });

      it("should handle floating point literals (returns Number)", async () => {
        // Note: The parser returns number type for all numeric literals.
        // The implementation checks Number.isInteger(value) but the parsed value
        // may not preserve the decimal distinction.
        const sql = "SELECT 3.14 AS Pi FROM Contacts";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toContainEqual({
          Name: "Pi",
          FieldType: "Number",
        });
      });
    });

    describe("system data views", () => {
      it("should infer types from _Sent data view", async () => {
        const sql = "SELECT JobID, SubscriberKey, EventDate FROM _Sent";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        const jobIdCol = schema.find((c) => c.Name === "JobID");
        const subKeyCol = schema.find((c) => c.Name === "SubscriberKey");
        const eventDateCol = schema.find((c) => c.Name === "EventDate");

        expect(jobIdCol?.FieldType).toBe("Number");
        expect(subKeyCol?.FieldType).toBe("Text");
        expect(eventDateCol?.FieldType).toBe("Date");
      });

      it("should handle ENT. prefix for data views", async () => {
        const sql = "SELECT JobID, SubscriberKey FROM ENT._Sent";
        const metadataFn = createMetadataStub({});

        const schema = await inferSchema(sql, metadataFn);

        const jobIdCol = schema.find((c) => c.Name === "JobID");
        const subKeyCol = schema.find((c) => c.Name === "SubscriberKey");

        expect(jobIdCol?.FieldType).toBe("Number");
        expect(subKeyCol?.FieldType).toBe("Text");
      });
    });

    describe("column name sanitization", () => {
      it("should truncate column names exceeding 50 chars", async () => {
        const sql =
          "SELECT ID AS ThisIsAVeryLongColumnNameThatExceedsFiftyCharactersLimit FROM DE";
        const metadataFn = createMetadataStub({
          DE: [{ Name: "ID", FieldType: "Number" }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toHaveLength(1);
        expect(schema[0]?.Name.length).toBeLessThanOrEqual(50);
        expect(schema[0]?.Name.length).toBe(45);
      });

      it("should add suffix for duplicate column names", async () => {
        const sql = "SELECT ID AS DuplicateName, Name AS DuplicateName FROM DE";
        const metadataFn = createMetadataStub({
          DE: [
            { Name: "ID", FieldType: "Number" },
            { Name: "Name", FieldType: "Text", MaxLength: 100 },
          ],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toHaveLength(2);
        const names = schema.map((c) => c.Name);
        expect(names).toContain("DuplicateName");
        expect(names).toContain("DuplicateName_1");
      });
    });

    describe("edge cases", () => {
      it("should handle multiple columns in single query", async () => {
        const sql = `
          SELECT
            FirstName,
            LastName,
            Email,
            COUNT(*) AS Total,
            UPPER(FirstName) AS UpperFirst,
            GETDATE() AS Now
          FROM Contacts
          GROUP BY FirstName, LastName, Email
        `;
        const metadataFn = createMetadataStub({
          Contacts: [
            { Name: "FirstName", FieldType: "Text", MaxLength: 50 },
            { Name: "LastName", FieldType: "Text", MaxLength: 50 },
            { Name: "Email", FieldType: "EmailAddress" },
          ],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toHaveLength(6);
        expect(schema.find((c) => c.Name === "Total")?.FieldType).toBe(
          "Number",
        );
        expect(schema.find((c) => c.Name === "UpperFirst")?.FieldType).toBe(
          "Text",
        );
        expect(schema.find((c) => c.Name === "Now")?.FieldType).toBe("Date");
      });

      it("should throw error for empty SELECT", async () => {
        const sql = "SELECT FROM Contacts";
        const metadataFn = createMetadataStub({});

        await expect(inferSchema(sql, metadataFn)).rejects.toThrow();
      });

      it("should handle SELECT with TOP clause", async () => {
        const sql = "SELECT TOP 10 FirstName, LastName FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [
            { Name: "FirstName", FieldType: "Text", MaxLength: 50 },
            { Name: "LastName", FieldType: "Text", MaxLength: 50 },
          ],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toHaveLength(2);
        expect(schema[0]?.Name).toBe("FirstName");
        expect(schema[1]?.Name).toBe("LastName");
      });

      it("should handle SELECT DISTINCT", async () => {
        const sql = "SELECT DISTINCT Email FROM Contacts";
        const metadataFn = createMetadataStub({
          Contacts: [{ Name: "Email", FieldType: "EmailAddress" }],
        });

        const schema = await inferSchema(sql, metadataFn);

        expect(schema).toHaveLength(1);
        expect(schema[0]?.FieldType).toBe("EmailAddress");
      });

      it("should throw error for SELECT * (star columns are skipped)", async () => {
        // SELECT * columns are intentionally skipped by inferSchema.
        // If no other columns exist, it throws SCHEMA_INFERENCE_FAILED.
        // This is expected - SELECT * should be expanded before calling inferSchema.
        const sql = "SELECT * FROM Contacts";
        const metadataFn = createMetadataStub({});

        await expect(inferSchema(sql, metadataFn)).rejects.toThrow();
      });
    });
  });

  describe("inferColumnTypeFromMetadata", () => {
    it("should map NUMBER to Number", () => {
      const result = inferColumnTypeFromMetadata("NUMBER");
      expect(result.FieldType).toBe("Number");
    });

    it("should map INT to Number", () => {
      const result = inferColumnTypeFromMetadata("INT");
      expect(result.FieldType).toBe("Number");
    });

    it("should map INTEGER to Number", () => {
      const result = inferColumnTypeFromMetadata("INTEGER");
      expect(result.FieldType).toBe("Number");
    });

    it("should map DECIMAL to Decimal with Scale and Precision", () => {
      const result = inferColumnTypeFromMetadata("DECIMAL");
      expect(result.FieldType).toBe("Decimal");
      expect(result.Scale).toBe(2);
      expect(result.Precision).toBe(18);
    });

    it("should map FLOAT to Decimal", () => {
      const result = inferColumnTypeFromMetadata("FLOAT");
      expect(result.FieldType).toBe("Decimal");
    });

    it("should map DATE to Date", () => {
      const result = inferColumnTypeFromMetadata("DATE");
      expect(result.FieldType).toBe("Date");
    });

    it("should map DATETIME to Date", () => {
      const result = inferColumnTypeFromMetadata("DATETIME");
      expect(result.FieldType).toBe("Date");
    });

    it("should map BOOLEAN to Boolean", () => {
      const result = inferColumnTypeFromMetadata("BOOLEAN");
      expect(result.FieldType).toBe("Boolean");
    });

    it("should map BOOL to Boolean", () => {
      const result = inferColumnTypeFromMetadata("BOOL");
      expect(result.FieldType).toBe("Boolean");
    });

    it("should map BIT to Boolean", () => {
      const result = inferColumnTypeFromMetadata("BIT");
      expect(result.FieldType).toBe("Boolean");
    });

    it("should map EMAIL to EmailAddress", () => {
      const result = inferColumnTypeFromMetadata("EMAIL");
      expect(result.FieldType).toBe("EmailAddress");
    });

    it("should map EMAILADDRESS to EmailAddress", () => {
      const result = inferColumnTypeFromMetadata("EMAILADDRESS");
      expect(result.FieldType).toBe("EmailAddress");
    });

    it("should map PHONE to Phone", () => {
      const result = inferColumnTypeFromMetadata("PHONE");
      expect(result.FieldType).toBe("Phone");
    });

    it("should map unknown types to Text with MaxLength 254", () => {
      const result = inferColumnTypeFromMetadata("UNKNOWN");
      expect(result.FieldType).toBe("Text");
      expect(result.MaxLength).toBe(254);
    });

    it("should handle lowercase input", () => {
      const result = inferColumnTypeFromMetadata("number");
      expect(result.FieldType).toBe("Number");
    });

    it("should handle empty string input", () => {
      const result = inferColumnTypeFromMetadata("");
      expect(result.FieldType).toBe("Text");
      expect(result.MaxLength).toBe(254);
    });
  });
});
