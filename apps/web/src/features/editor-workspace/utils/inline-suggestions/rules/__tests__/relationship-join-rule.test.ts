import assert from "node:assert";

import { describe, expect, it, vi } from "vitest";

import type { InlineSuggestionContext } from "@/features/editor-workspace/utils/inline-suggestions/types";
import type {
  RelationshipEdge,
  RelationshipGraph,
} from "@/features/editor-workspace/utils/relationship-graph/types";

import { relationshipJoinRule } from "../relationship-join-rule";

function makeTable(
  name: string,
  alias?: string,
): InlineSuggestionContext["tablesInScope"][0] {
  return {
    name,
    qualifiedName: name,
    alias,
    startIndex: 0,
    endIndex: name.length,
    isBracketed: false,
    isSubquery: false,
    scopeDepth: 0,
    outputFields: [],
  };
}

function makeEdge(
  sourceDE: string,
  sourceColumn: string,
  targetDE: string,
  targetColumn: string,
  confidence: RelationshipEdge["confidence"] = "confirmed",
): RelationshipEdge {
  return {
    sourceDE,
    sourceColumn,
    targetDE,
    targetColumn,
    confidence,
    source: "user",
  };
}

function makeGraph(edges: RelationshipEdge[]): RelationshipGraph {
  return { edges, exclusions: [] };
}

function makeCtx(
  overrides: Partial<InlineSuggestionContext>,
): InlineSuggestionContext {
  return {
    sql: "SELECT * FROM A",
    cursorIndex: 16,
    sqlContext: {
      cursorDepth: 0,
      currentWord: "",
      aliasBeforeDot: null,
      isAfterFromJoin: false,
      isAfterSelect: false,
      lastKeyword: null,
      hasTableReference: false,
      cursorInTableReference: false,
      hasFromJoinTable: false,
      cursorInFromJoinTable: false,
      tablesInScope: [],
      aliasMap: new Map(),
    },
    tablesInScope: [],
    existingAliases: new Set(),
    getFieldsForTable: vi
      .fn()
      .mockRejectedValue(new Error("unexpected call to getFieldsForTable")),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// matches()
// ---------------------------------------------------------------------------

describe("relationshipJoinRule.matches", () => {
  it("returns false when no relationship graph", () => {
    const ctx = makeCtx({
      relationshipGraph: undefined,
      tablesInScope: [makeTable("A")],
      sqlContext: { ...makeCtx({}).sqlContext, lastKeyword: "join" },
    });
    expect(relationshipJoinRule.matches(ctx)).toBe(false);
  });

  it("returns false when graph has no edges", () => {
    const ctx = makeCtx({
      relationshipGraph: makeGraph([]),
      tablesInScope: [makeTable("A")],
      sqlContext: { ...makeCtx({}).sqlContext, lastKeyword: "join" },
    });
    expect(relationshipJoinRule.matches(ctx)).toBe(false);
  });

  it("returns false when no tables in scope", () => {
    const ctx = makeCtx({
      relationshipGraph: makeGraph([makeEdge("A", "c", "B", "d")]),
      tablesInScope: [],
      sqlContext: { ...makeCtx({}).sqlContext, lastKeyword: "join" },
    });
    expect(relationshipJoinRule.matches(ctx)).toBe(false);
  });

  it("returns false when lastKeyword is not join or on", () => {
    const ctx = makeCtx({
      relationshipGraph: makeGraph([makeEdge("A", "c", "B", "d")]),
      tablesInScope: [makeTable("A")],
      sqlContext: { ...makeCtx({}).sqlContext, lastKeyword: "where" },
    });
    expect(relationshipJoinRule.matches(ctx)).toBe(false);
  });

  it("returns true when lastKeyword is 'on' and no currentWord", () => {
    const ctx = makeCtx({
      relationshipGraph: makeGraph([makeEdge("A", "c", "B", "d")]),
      tablesInScope: [makeTable("A"), makeTable("B")],
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "on",
        currentWord: "",
      },
    });
    expect(relationshipJoinRule.matches(ctx)).toBe(true);
  });

  it("returns true when lastKeyword is 'join' and cursor is right after JOIN", () => {
    const sql = "SELECT * FROM A JOIN ";
    const ctx = makeCtx({
      sql,
      cursorIndex: sql.length,
      relationshipGraph: makeGraph([makeEdge("A", "c", "B", "d")]),
      tablesInScope: [makeTable("A")],
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "join",
        hasFromJoinTable: false,
      },
    });
    expect(relationshipJoinRule.matches(ctx)).toBe(true);
  });

  it("returns true when lastKeyword is 'join' and user has started typing", () => {
    const sql = "SELECT * FROM A JOIN Or";
    const ctx = makeCtx({
      sql,
      cursorIndex: sql.length,
      relationshipGraph: makeGraph([makeEdge("A", "c", "Orders", "d")]),
      tablesInScope: [makeTable("A")],
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "join",
        currentWord: "Or",
        hasFromJoinTable: false,
      },
    });
    expect(relationshipJoinRule.matches(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSuggestion() — JOIN table suggestions
// ---------------------------------------------------------------------------

describe("relationshipJoinRule.getSuggestion (JOIN)", () => {
  it("returns null when no relationship graph", async () => {
    const ctx = makeCtx({
      relationshipGraph: undefined,
      tablesInScope: [makeTable("A")],
      sqlContext: { ...makeCtx({}).sqlContext, lastKeyword: "join" },
    });
    const result = await relationshipJoinRule.getSuggestion(ctx);
    expect(result).toBeNull();
  });

  it("returns table name + alias + ON clause for a related table", async () => {
    const sql = "SELECT * FROM Subscribers s JOIN ";
    const ctx = makeCtx({
      sql,
      cursorIndex: sql.length,
      relationshipGraph: makeGraph([
        makeEdge("Subscribers", "SubscriberKey", "Orders", "SubscriberKey"),
      ]),
      tablesInScope: [makeTable("Subscribers", "s")],
      existingAliases: new Set(["s"]),
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "join",
        currentWord: "",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);

    assert(result);
    expect(result.text).toContain("Orders");
    expect(result.text).toContain("ON s.SubscriberKey =");
    expect(result.priority).toBe(90);
  });

  it("filters candidates by currentWord prefix", async () => {
    const sql = "SELECT * FROM Subscribers s JOIN Or";
    const ctx = makeCtx({
      sql,
      cursorIndex: sql.length,
      relationshipGraph: makeGraph([
        makeEdge("Subscribers", "SubscriberKey", "Orders", "SubscriberKey"),
        makeEdge("Subscribers", "Email", "Campaigns", "Email"),
      ]),
      tablesInScope: [makeTable("Subscribers", "s")],
      existingAliases: new Set(["s"]),
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "join",
        currentWord: "Or",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);

    assert(result);
    expect(result.text).toMatch(/^ders/);
    expect(result.text).toContain("ON s.SubscriberKey =");
    expect(result.text).not.toContain("Campaigns");
  });

  it("returns null when no candidates match prefix", async () => {
    const sql = "SELECT * FROM Subscribers s JOIN Zzz";
    const ctx = makeCtx({
      sql,
      cursorIndex: sql.length,
      relationshipGraph: makeGraph([
        makeEdge("Subscribers", "SubscriberKey", "Orders", "SubscriberKey"),
      ]),
      tablesInScope: [makeTable("Subscribers", "s")],
      existingAliases: new Set(["s"]),
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "join",
        currentWord: "Zzz",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);
    expect(result).toBeNull();
  });

  it("sorts candidates by confidence (confirmed > high > medium > low)", async () => {
    const sql = "SELECT * FROM Subscribers s JOIN ";
    const ctx = makeCtx({
      sql,
      cursorIndex: sql.length,
      relationshipGraph: makeGraph([
        makeEdge("Subscribers", "Col1", "LowTable", "Col1", "low"),
        makeEdge("Subscribers", "Col2", "HighTable", "Col2", "high"),
        makeEdge("Subscribers", "Col3", "ConfirmedTable", "Col3", "confirmed"),
      ]),
      tablesInScope: [makeTable("Subscribers", "s")],
      existingAliases: new Set(["s"]),
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "join",
        currentWord: "",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);

    assert(result);
    expect(result.text).toContain("ConfirmedTable");
    assert(result.alternatives);
    expect(result.alternatives).toHaveLength(2);
  });

  it("suggests via reverse-direction edge when target is in scope", async () => {
    const sql = "SELECT * FROM Subscribers s JOIN ";
    const ctx = makeCtx({
      sql,
      cursorIndex: sql.length,
      relationshipGraph: makeGraph([
        makeEdge("Orders", "SubscriberKey", "Subscribers", "SubscriberKey"),
      ]),
      tablesInScope: [makeTable("Subscribers", "s")],
      existingAliases: new Set(["s"]),
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "join",
        currentWord: "",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);

    assert(result);
    expect(result.text).toContain("Orders");
    expect(result.text).toContain("ON s.SubscriberKey =");
  });

  it("uses qualifiedName in ON clause when source table has no alias", async () => {
    const sql = "SELECT * FROM Subscribers JOIN ";
    const ctx = makeCtx({
      sql,
      cursorIndex: sql.length,
      relationshipGraph: makeGraph([
        makeEdge("Subscribers", "SubscriberKey", "Orders", "SubscriberKey"),
      ]),
      tablesInScope: [makeTable("Subscribers")],
      existingAliases: new Set(),
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "join",
        currentWord: "",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);

    assert(result);
    expect(result.text).toContain("ON Subscribers.SubscriberKey =");
  });

  it("excludes tables already in scope", async () => {
    const sql = "SELECT * FROM Subscribers s JOIN Orders o JOIN ";
    const ctx = makeCtx({
      sql,
      cursorIndex: sql.length,
      relationshipGraph: makeGraph([
        makeEdge("Subscribers", "SubscriberKey", "Orders", "SubscriberKey"),
        makeEdge("Orders", "ProductId", "Products", "Id"),
      ]),
      tablesInScope: [makeTable("Subscribers", "s"), makeTable("Orders", "o")],
      existingAliases: new Set(["s", "o"]),
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "join",
        currentWord: "",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);

    assert(result);
    expect(result.text).toContain("Products");
    expect(result.text).not.toContain("Subscribers");
  });
});

// ---------------------------------------------------------------------------
// getSuggestion() — ON condition suggestions
// ---------------------------------------------------------------------------

describe("relationshipJoinRule.getSuggestion (ON)", () => {
  it("returns leftAlias.col = rightAlias.col for the best matching edge", async () => {
    const ctx = makeCtx({
      relationshipGraph: makeGraph([
        makeEdge("Subscribers", "SubscriberKey", "Orders", "SubscriberKey"),
      ]),
      tablesInScope: [makeTable("Subscribers", "s"), makeTable("Orders", "o")],
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "on",
        currentWord: "",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);

    assert(result);
    expect(result.text).toBe("s.SubscriberKey = o.SubscriberKey");
    expect(result.priority).toBe(65);
  });

  it("uses last two tables in scope as left/right", async () => {
    const ctx = makeCtx({
      relationshipGraph: makeGraph([
        makeEdge("Orders", "ProductId", "Products", "Id"),
      ]),
      tablesInScope: [
        makeTable("Subscribers", "s"),
        makeTable("Orders", "o"),
        makeTable("Products", "p"),
      ],
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "on",
        currentWord: "",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);

    assert(result);
    expect(result.text).toBe("o.ProductId = p.Id");
  });

  it("returns null when fewer than 2 tables in scope", async () => {
    const ctx = makeCtx({
      relationshipGraph: makeGraph([makeEdge("A", "c", "B", "d")]),
      tablesInScope: [makeTable("A")],
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "on",
        currentWord: "",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);
    expect(result).toBeNull();
  });

  it("returns null when no edges match the two tables", async () => {
    const ctx = makeCtx({
      relationshipGraph: makeGraph([makeEdge("X", "c", "Y", "d")]),
      tablesInScope: [makeTable("A", "a"), makeTable("B", "b")],
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "on",
        currentWord: "",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);
    expect(result).toBeNull();
  });

  it("returns no alternatives when only one edge matches", async () => {
    const ctx = makeCtx({
      relationshipGraph: makeGraph([
        makeEdge("Subscribers", "SubscriberKey", "Orders", "SubscriberKey"),
      ]),
      tablesInScope: [makeTable("Subscribers", "s"), makeTable("Orders", "o")],
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "on",
        currentWord: "",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);

    assert(result);
    expect(result.text).toBe("s.SubscriberKey = o.SubscriberKey");
    expect(result.alternatives).toBeUndefined();
  });

  it("sorts by confidence and returns up to 3 alternatives", async () => {
    const ctx = makeCtx({
      relationshipGraph: makeGraph([
        makeEdge("A", "col1", "B", "col1", "low"),
        makeEdge("A", "col2", "B", "col2", "confirmed"),
        makeEdge("A", "col3", "B", "col3", "high"),
        makeEdge("A", "col4", "B", "col4", "medium"),
        makeEdge("A", "col5", "B", "col5", "medium"),
      ]),
      tablesInScope: [makeTable("A", "a"), makeTable("B", "b")],
      sqlContext: {
        ...makeCtx({}).sqlContext,
        lastKeyword: "on",
        currentWord: "",
      },
    });

    const result = await relationshipJoinRule.getSuggestion(ctx);

    assert(result);
    expect(result.text).toBe("a.col2 = b.col2");
    expect(result.alternatives).toHaveLength(3);
  });
});
