import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { prohibitedKeywordsRule } from "./prohibited-keywords";

const createContext = (sql: string): LintContext => ({ sql, tokens: [] });

describe("prohibitedKeywordsRule", () => {
  it("flags prohibited DML keywords", () => {
    const diagnostics = prohibitedKeywordsRule.check(
      createContext("UPDATE Contacts SET Name = 'Test' WHERE Id = 1"),
    );

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.some((d) => d.message.includes("UPDATE"))).toBe(true);
  });

  it("does not flag prohibited keywords inside string literals", () => {
    const diagnostics = prohibitedKeywordsRule.check(
      createContext("SELECT 'UPDATE' AS Example FROM [A]"),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
