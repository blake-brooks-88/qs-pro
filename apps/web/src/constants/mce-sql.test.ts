import { describe, expect, test } from "vitest";
import {
  MCE_SQL_KEYWORDS,
  MCE_SQL_PROHIBITED_DML,
  MCE_SQL_PROHIBITED_DDL,
  MCE_SQL_PROHIBITED_PROCEDURAL,
  MCE_SQL_ALL_PROHIBITED,
  MCE_SQL_UNSUPPORTED_FUNCTIONS,
  MCE_SQL_SUPPORTED_FUNCTIONS,
  MCE_SQL_DATA_TYPES,
} from "./mce-sql";

describe("MCE SQL Constants", () => {
  describe("MCE_SQL_KEYWORDS", () => {
    test("includes core SQL keywords", () => {
      expect(MCE_SQL_KEYWORDS.has("select")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("from")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("where")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("join")).toBe(true);
    });

    test("includes join variants", () => {
      expect(MCE_SQL_KEYWORDS.has("inner")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("left")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("right")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("full")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("outer")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("cross")).toBe(true);
    });

    test("includes control flow keywords", () => {
      expect(MCE_SQL_KEYWORDS.has("case")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("when")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("then")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("else")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("end")).toBe(true);
    });

    test("includes OFFSET/FETCH keywords", () => {
      expect(MCE_SQL_KEYWORDS.has("offset")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("fetch")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("next")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("rows")).toBe(true);
      expect(MCE_SQL_KEYWORDS.has("only")).toBe(true);
    });
  });

  describe("MCE_SQL_PROHIBITED_DML", () => {
    test("includes DML keywords", () => {
      expect(MCE_SQL_PROHIBITED_DML.has("insert")).toBe(true);
      expect(MCE_SQL_PROHIBITED_DML.has("update")).toBe(true);
      expect(MCE_SQL_PROHIBITED_DML.has("delete")).toBe(true);
      expect(MCE_SQL_PROHIBITED_DML.has("merge")).toBe(true);
      expect(MCE_SQL_PROHIBITED_DML.has("truncate")).toBe(true);
    });

    test("does not include SELECT", () => {
      expect(MCE_SQL_PROHIBITED_DML.has("select")).toBe(false);
    });
  });

  describe("MCE_SQL_PROHIBITED_DDL", () => {
    test("includes DDL keywords", () => {
      expect(MCE_SQL_PROHIBITED_DDL.has("create")).toBe(true);
      expect(MCE_SQL_PROHIBITED_DDL.has("drop")).toBe(true);
      expect(MCE_SQL_PROHIBITED_DDL.has("alter")).toBe(true);
    });

    test("includes transaction keywords", () => {
      expect(MCE_SQL_PROHIBITED_DDL.has("commit")).toBe(true);
      expect(MCE_SQL_PROHIBITED_DDL.has("rollback")).toBe(true);
      expect(MCE_SQL_PROHIBITED_DDL.has("savepoint")).toBe(true);
    });
  });

  describe("MCE_SQL_PROHIBITED_PROCEDURAL", () => {
    test("includes procedural keywords", () => {
      expect(MCE_SQL_PROHIBITED_PROCEDURAL.has("declare")).toBe(true);
      expect(MCE_SQL_PROHIBITED_PROCEDURAL.has("set")).toBe(true);
      expect(MCE_SQL_PROHIBITED_PROCEDURAL.has("while")).toBe(true);
      expect(MCE_SQL_PROHIBITED_PROCEDURAL.has("if")).toBe(true);
      expect(MCE_SQL_PROHIBITED_PROCEDURAL.has("print")).toBe(true);
    });
  });

  describe("MCE_SQL_ALL_PROHIBITED", () => {
    test("combines all prohibited sets", () => {
      expect(MCE_SQL_ALL_PROHIBITED.has("insert")).toBe(true);
      expect(MCE_SQL_ALL_PROHIBITED.has("create")).toBe(true);
      expect(MCE_SQL_ALL_PROHIBITED.has("declare")).toBe(true);
    });

    test("has correct size", () => {
      const expectedSize =
        MCE_SQL_PROHIBITED_DML.size +
        MCE_SQL_PROHIBITED_DDL.size +
        MCE_SQL_PROHIBITED_PROCEDURAL.size;
      expect(MCE_SQL_ALL_PROHIBITED.size).toBe(expectedSize);
    });
  });

  describe("MCE_SQL_UNSUPPORTED_FUNCTIONS", () => {
    test("includes known unsupported functions", () => {
      expect(MCE_SQL_UNSUPPORTED_FUNCTIONS.get("openjson")).toBe(null);
      expect(MCE_SQL_UNSUPPORTED_FUNCTIONS.get("try_convert")).toBe(
        "Use CONVERT() instead",
      );
      expect(MCE_SQL_UNSUPPORTED_FUNCTIONS.get("try_cast")).toBe(
        "Use CAST() instead",
      );
    });

    test("does not include supported functions", () => {
      expect(MCE_SQL_UNSUPPORTED_FUNCTIONS.get("json_value")).toBeUndefined();
      expect(MCE_SQL_UNSUPPORTED_FUNCTIONS.get("concat")).toBeUndefined();
      expect(MCE_SQL_UNSUPPORTED_FUNCTIONS.get("string_agg")).toBeUndefined();
    });
  });

  describe("MCE_SQL_SUPPORTED_FUNCTIONS", () => {
    test("includes common string functions", () => {
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("left")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("right")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("concat")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("len")).toBe(true);
    });

    test("includes date functions", () => {
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("getdate")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("dateadd")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("datediff")).toBe(true);
    });

    test("includes aggregate functions", () => {
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("count")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("sum")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("avg")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("min")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("max")).toBe(true);
    });

    test("includes NULL handling functions", () => {
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("isnull")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("coalesce")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("nullif")).toBe(true);
    });

    test("includes supported JSON functions", () => {
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("json_value")).toBe(true);
      expect(MCE_SQL_SUPPORTED_FUNCTIONS.has("json_query")).toBe(true);
    });
  });

  describe("MCE_SQL_DATA_TYPES", () => {
    test("includes numeric types", () => {
      expect(MCE_SQL_DATA_TYPES.has("int")).toBe(true);
      expect(MCE_SQL_DATA_TYPES.has("bigint")).toBe(true);
      expect(MCE_SQL_DATA_TYPES.has("decimal")).toBe(true);
      expect(MCE_SQL_DATA_TYPES.has("float")).toBe(true);
    });

    test("includes string types", () => {
      expect(MCE_SQL_DATA_TYPES.has("varchar")).toBe(true);
      expect(MCE_SQL_DATA_TYPES.has("nvarchar")).toBe(true);
      expect(MCE_SQL_DATA_TYPES.has("char")).toBe(true);
      expect(MCE_SQL_DATA_TYPES.has("text")).toBe(true);
    });

    test("includes date types", () => {
      expect(MCE_SQL_DATA_TYPES.has("date")).toBe(true);
      expect(MCE_SQL_DATA_TYPES.has("datetime")).toBe(true);
      expect(MCE_SQL_DATA_TYPES.has("datetime2")).toBe(true);
    });
  });
});
