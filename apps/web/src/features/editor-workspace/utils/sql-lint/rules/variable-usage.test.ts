import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { variableUsageRule } from "./variable-usage";

const createContext = (sql: string): LintContext => ({ sql, tokens: [] });

describe("variableUsageRule", () => {
  it("flags @variables in SQL", () => {
    const diagnostics = variableUsageRule.check(
      createContext("SELECT * FROM [A] WHERE Id = @id"),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toContain("@id");
  });

  it("does not flag @variables inside string literals", () => {
    const diagnostics = variableUsageRule.check(
      createContext("SELECT '@id' AS Example FROM [A]"),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
