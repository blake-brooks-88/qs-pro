import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { offsetWithoutOrderByRule } from "./offset-without-order-by";

const createContext = (sql: string): LintContext => ({ sql, tokens: [] });

describe("offsetWithoutOrderByRule", () => {
  it("flags OFFSET usage without ORDER BY", () => {
    const diagnostics = offsetWithoutOrderByRule.check(
      createContext("SELECT * FROM A OFFSET 10 ROWS"),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toContain("ORDER BY");
  });

  it("allows OFFSET when ORDER BY is present", () => {
    const diagnostics = offsetWithoutOrderByRule.check(
      createContext("SELECT * FROM A ORDER BY Id OFFSET 10 ROWS"),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
