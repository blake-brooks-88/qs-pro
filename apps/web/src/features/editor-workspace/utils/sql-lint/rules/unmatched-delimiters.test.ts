import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { unmatchedDelimitersRule } from "./unmatched-delimiters";

const createContext = (sql: string): LintContext => ({ sql, tokens: [] });

describe("unmatchedDelimitersRule", () => {
  it("flags unclosed brackets", () => {
    const diagnostics = unmatchedDelimitersRule.check(
      createContext("SELECT * FROM [A"),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toContain("Unclosed bracket");
  });

  it("does not flag balanced brackets", () => {
    const diagnostics = unmatchedDelimitersRule.check(
      createContext("SELECT * FROM [A]"),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
