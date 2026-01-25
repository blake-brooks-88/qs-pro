import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { aggregateGroupingRule } from "./aggregate-grouping";

const createContext = (sql: string): LintContext => ({ sql, tokens: [] });

describe("aggregateGroupingRule", () => {
  it("flags non-aggregated fields mixed with aggregates without GROUP BY", () => {
    const diagnostics = aggregateGroupingRule.check(
      createContext("SELECT Region, COUNT(*) FROM Sales"),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toContain("Region");
    expect(diagnostics[0]?.message).toContain("GROUP BY");
  });

  it("allows non-aggregated fields when they are included in GROUP BY", () => {
    const diagnostics = aggregateGroupingRule.check(
      createContext("SELECT Region, COUNT(*) FROM Sales GROUP BY Region"),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
