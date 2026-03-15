import { describe, expect, it } from "vitest";

import { BUILT_IN_SNIPPETS } from "../built-in-snippets";

describe("BUILT_IN_SNIPPETS data integrity", () => {
  it("contains exactly 10 snippets", () => {
    expect(BUILT_IN_SNIPPETS).toHaveLength(10);
  });

  it("all snippets have unique id values", () => {
    const ids = BUILT_IN_SNIPPETS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(BUILT_IN_SNIPPETS.length);
  });

  it("all snippets have unique triggerPrefix values", () => {
    const prefixes = BUILT_IN_SNIPPETS.map((s) => s.triggerPrefix);
    const uniquePrefixes = new Set(prefixes);
    expect(uniquePrefixes.size).toBe(BUILT_IN_SNIPPETS.length);
  });

  it("all trigger prefixes match the alphanumeric-starting regex", () => {
    const validPrefix = /^[a-zA-Z][a-zA-Z0-9]*$/;
    for (const snippet of BUILT_IN_SNIPPETS) {
      expect(
        snippet.triggerPrefix,
        `Snippet "${snippet.id}" has invalid triggerPrefix: "${snippet.triggerPrefix}"`,
      ).toMatch(validPrefix);
    }
  });

  it("all snippets have non-empty title, description, and body", () => {
    for (const snippet of BUILT_IN_SNIPPETS) {
      expect(
        snippet.title.trim(),
        `Snippet "${snippet.id}" has empty title`,
      ).not.toBe("");
      expect(
        snippet.description.trim(),
        `Snippet "${snippet.id}" has empty description`,
      ).not.toBe("");
      expect(
        snippet.body.trim(),
        `Snippet "${snippet.id}" has empty body`,
      ).not.toBe("");
    }
  });

  it("all snippets have isBuiltin: true", () => {
    for (const snippet of BUILT_IN_SNIPPETS) {
      expect(
        snippet.isBuiltin,
        `Snippet "${snippet.id}" has isBuiltin !== true`,
      ).toBe(true);
    }
  });

  it("all snippets have valid category values", () => {
    const validCategories = new Set(["free", "pro"]);
    for (const snippet of BUILT_IN_SNIPPETS) {
      expect(
        validCategories.has(snippet.category),
        `Snippet "${snippet.id}" has invalid category: "${snippet.category}"`,
      ).toBe(true);
    }
  });

  it("at least 2 snippets have category: 'free' (the teaser set)", () => {
    const freeSnippets = BUILT_IN_SNIPPETS.filter((s) => s.category === "free");
    expect(freeSnippets.length).toBeGreaterThanOrEqual(2);
  });

  it("all snippet bodies containing ${ use valid tab-stop syntax ${N:text}", () => {
    // Valid tab-stop: ${digit:anytext}
    const validTabStop = /\$\{\d+:[^}]*\}/;
    // Invalid: bare ${ not followed by digit:
    const invalidTabStop = /\$\{(?!\d+:)/;

    // Filter to only snippets that contain ${ before asserting
    const snippetsWithTabStops = BUILT_IN_SNIPPETS.filter((s) =>
      s.body.includes("${"),
    );
    // All built-in snippets should use tab-stop syntax
    expect(snippetsWithTabStops.length).toBeGreaterThan(0);

    for (const snippet of snippetsWithTabStops) {
      expect(
        invalidTabStop.test(snippet.body),
        `Snippet "${snippet.id}" contains invalid tab-stop syntax in body`,
      ).toBe(false);
      expect(
        validTabStop.test(snippet.body),
        `Snippet "${snippet.id}" has dollar-brace but no valid tab-stop found`,
      ).toBe(true);
    }
  });

  it("the 'track' snippet contains LEFT JOIN patterns for tracking data consolidation", () => {
    const trackSnippet = BUILT_IN_SNIPPETS.find(
      (s) => s.triggerPrefix === "track",
    );
    if (!trackSnippet) {
      throw new Error("Expected 'track' snippet to exist");
    }
    expect(trackSnippet.body).toMatch(/LEFT JOIN/i);
    // Should join multiple tracking system DEs
    expect(trackSnippet.body).toContain("_Sent");
    expect(trackSnippet.body).toContain("_Open");
    expect(trackSnippet.body).toContain("_Click");
  });

  it("free tier snippets include sel, sjoin, and dist", () => {
    const freePrefixes = BUILT_IN_SNIPPETS.filter(
      (s) => s.category === "free",
    ).map((s) => s.triggerPrefix);
    expect(freePrefixes).toContain("sel");
    expect(freePrefixes).toContain("sjoin");
    expect(freePrefixes).toContain("dist");
  });
});
