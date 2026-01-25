import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { unsupportedFunctionsRule } from "./unsupported-functions";

const createContext = (sql: string): LintContext => ({ sql, tokens: [] });

describe("unsupportedFunctionsRule", () => {
  it("flags unsupported functions", () => {
    const diagnostics = unsupportedFunctionsRule.check(
      createContext("SELECT TRY_CONVERT(INT, '1') AS Value"),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toContain("TRY_CONVERT");
    expect(diagnostics[0]?.message).toContain("CONVERT");
  });

  it("does not flag supported functions", () => {
    const diagnostics = unsupportedFunctionsRule.check(
      createContext("SELECT CONVERT(INT, '1') AS Value"),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
