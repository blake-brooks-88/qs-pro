import { describe, expect, it } from "vitest";

import type {
  DataExtension,
  DataExtensionField,
} from "@/features/editor-workspace/types";

import type { LintContext } from "../types";
import { tokenizeSql } from "../utils/tokenizer";
import { ambiguousFieldsRule } from "./ambiguous-fields";

const makeFields = (names: string[]): DataExtensionField[] =>
  names.map((name) => ({
    name,
    type: "Text",
    isPrimaryKey: false,
    isNullable: true,
  }));

const makeDe = (name: string, fieldNames: string[]): DataExtension => ({
  id: name,
  name,
  customerKey: name,
  folderId: "0",
  description: "",
  fields: makeFields(fieldNames),
  isShared: false,
});

const createContext = (
  sql: string,
  dataExtensions: DataExtension[],
): LintContext => ({
  sql,
  tokens: tokenizeSql(sql),
  dataExtensions,
});

describe("ambiguousFieldsRule", () => {
  it("flags unqualified fields that exist in multiple joined tables", () => {
    const sql = "SELECT Id FROM [TableA] a JOIN [TableB] b ON a.Id = b.Id";
    const diagnostics = ambiguousFieldsRule.check(
      createContext(sql, [makeDe("TableA", ["Id"]), makeDe("TableB", ["Id"])]),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toContain("exists in multiple tables");
  });

  it("does not flag qualified fields", () => {
    const sql = "SELECT a.Id FROM [TableA] a JOIN [TableB] b ON a.Id = b.Id";
    const diagnostics = ambiguousFieldsRule.check(
      createContext(sql, [makeDe("TableA", ["Id"]), makeDe("TableB", ["Id"])]),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
