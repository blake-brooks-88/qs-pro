import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { selectStarSingleRule } from "./select-star-single";

const createContext = (sql: string): LintContext => ({ sql, tokens: [] });

describe("selectStarSingleRule", () => {
  it("warns on SELECT * for single-table queries", () => {
    const diagnostics = selectStarSingleRule.check(
      createContext("SELECT * FROM [A]"),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("warning");
    expect(diagnostics[0]?.message).toContain("SELECT *");
  });

  it("does not warn on SELECT * when JOIN is present", () => {
    const diagnostics = selectStarSingleRule.check(
      createContext("SELECT * FROM [A] a JOIN [B] b ON a.Id = b.Id"),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
