import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { tokenizeSql } from "../utils/tokenizer";
import { selectClauseRule } from "./select-clause";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: tokenizeSql(sql),
});

describe("selectClauseRule", () => {
  it("requires a SELECT statement", () => {
    const diagnostics = selectClauseRule.check(createContext("FROM [A]"));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("prereq");
    expect(diagnostics[0]?.message).toContain("SELECT");
  });

  it("requires aliases for literal SELECT expressions", () => {
    const diagnostics = selectClauseRule.check(createContext("SELECT 1"));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toContain("alias");
  });

  it("allows aliased literal SELECT expressions without a FROM clause", () => {
    const diagnostics = selectClauseRule.check(
      createContext("SELECT 1 AS One"),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
