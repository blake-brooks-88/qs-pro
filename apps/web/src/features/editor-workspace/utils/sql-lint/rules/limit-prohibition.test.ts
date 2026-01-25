import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { limitProhibitionRule } from "./limit-prohibition";

const createContext = (sql: string): LintContext => ({ sql, tokens: [] });

describe("limitProhibitionRule", () => {
  it("flags LIMIT usage", () => {
    const diagnostics = limitProhibitionRule.check(
      createContext("SELECT * FROM A LIMIT 10"),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toContain("LIMIT");
  });

  it("allows TOP syntax", () => {
    const diagnostics = limitProhibitionRule.check(
      createContext("SELECT TOP 10 * FROM A"),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
