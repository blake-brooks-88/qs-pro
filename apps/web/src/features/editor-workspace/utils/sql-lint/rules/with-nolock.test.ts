import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { withNolockRule } from "./with-nolock";

const createContext = (sql: string): LintContext => ({ sql, tokens: [] });

describe("withNolockRule", () => {
  it("warns on WITH (NOLOCK) usage", () => {
    const diagnostics = withNolockRule.check(
      createContext("SELECT * FROM [A] WITH (NOLOCK)"),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("warning");
    expect(diagnostics[0]?.message).toContain("NOLOCK");
  });

  it("does not warn when the hint is absent", () => {
    const diagnostics = withNolockRule.check(
      createContext("SELECT * FROM [A]"),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
