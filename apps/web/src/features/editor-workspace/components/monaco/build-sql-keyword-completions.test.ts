import { describe, expect, it } from "vitest";

import { buildSqlKeywordCompletions } from "./build-sql-keyword-completions";

describe("buildSqlKeywordCompletions", () => {
  it("prioritizes contextual keywords via sortText", () => {
    const completions = buildSqlKeywordCompletions("select");

    const from = completions.find((c) => c.label === "FROM");
    expect(from).toBeDefined();
    expect(from?.sortText.startsWith("0-")).toBe(true);
  });

  it("marks FROM and JOIN as snippets that include brackets", () => {
    const completions = buildSqlKeywordCompletions(null);

    const from = completions.find((c) => c.label === "FROM");
    const join = completions.find((c) => c.label === "JOIN");
    const where = completions.find((c) => c.label === "WHERE");

    expect(from?.insertAsSnippet).toBe(true);
    expect(from?.insertText).toContain("[$0]");

    expect(join?.insertAsSnippet).toBe(true);
    expect(join?.insertText).toContain("[$0]");

    expect(where?.insertAsSnippet).toBe(false);
    expect(where?.insertText).toBe("WHERE");
  });
});
