import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { cteDetectionRule } from "./cte-detection";

const createContext = (sql: string): LintContext => ({ sql, tokens: [] });

describe("cteDetectionRule", () => {
  it("flags CTE usage (WITH ... AS (...))", () => {
    const diagnostics = cteDetectionRule.check(
      createContext("WITH cte AS (SELECT 1 AS One) SELECT * FROM cte"),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toContain("WITH");
  });

  it("ignores keyword-like text inside string literals", () => {
    const diagnostics = cteDetectionRule.check(
      createContext("SELECT 'WITH cte AS' AS Example"),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
