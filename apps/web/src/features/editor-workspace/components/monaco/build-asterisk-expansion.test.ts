import { describe, expect, it, vi } from "vitest";

import type { DataExtensionField } from "@/features/editor-workspace/types";

import {
  type AsteriskExpansionResult,
  buildAsteriskExpansion,
  type TableInScopeForExpansion,
} from "./build-asterisk-expansion";

describe("buildAsteriskExpansion", () => {
  it("returns issue when multiple tables have no aliases", async () => {
    const tablesInScope: TableInScopeForExpansion[] = [
      { name: "Customers", alias: null, isSubquery: false, outputFields: [] },
      { name: "Orders", alias: null, isSubquery: false, outputFields: [] },
    ];

    const result = await buildAsteriskExpansion({
      textBeforeCursor: "SELECT *",
      cursorIndex: "SELECT *".length,
      tablesInScope,
      getFieldsForTable: async () => [],
    });

    expect(result.type).toBe("issue");
    const issue = result as Extract<AsteriskExpansionResult, { type: "issue" }>;
    expect(issue.message).toContain("Cannot expand");
  });

  it("returns none when no trailing asterisk", async () => {
    const tablesInScope: TableInScopeForExpansion[] = [
      { name: "Customers", alias: "c", isSubquery: false, outputFields: [] },
    ];

    const getFieldsForTable = vi.fn(async () => [
      {
        name: "Email",
        type: "EmailAddress",
        isPrimaryKey: true,
        isNullable: false,
      } satisfies DataExtensionField,
    ]);

    const result = await buildAsteriskExpansion({
      textBeforeCursor: "SELECT ",
      cursorIndex: "SELECT ".length,
      tablesInScope,
      getFieldsForTable,
    });

    expect(result).toEqual({ type: "none" });
  });

  it("expands subquery outputFields and quotes spaces", async () => {
    const tablesInScope: TableInScopeForExpansion[] = [
      {
        name: "sub",
        alias: "s",
        isSubquery: true,
        outputFields: ["First Name", "LastName"],
      },
    ];

    const result = await buildAsteriskExpansion({
      textBeforeCursor: "SELECT *",
      cursorIndex: "SELECT *".length,
      tablesInScope,
      getFieldsForTable: async () => [],
    });

    expect(result.type).toBe("expand");
    const expanded = result as Extract<
      AsteriskExpansionResult,
      { type: "expand" }
    >;
    expect(expanded.columnCount).toBe(2);
    expect(expanded.expandedColumns).toContain("s.[First Name]");
    expect(expanded.expandedColumns).toContain("s.LastName");
    expect(expanded.replaceOffsets.startOffset).toBe("SELECT ".length);
    expect(expanded.replaceOffsets.endOffset).toBe("SELECT *".length);
  });

  it("expands fetched fields and includes alias prefix when present", async () => {
    const tablesInScope: TableInScopeForExpansion[] = [
      { name: "Customers", alias: "c", isSubquery: false, outputFields: [] },
    ];

    const getFieldsForTable = vi.fn(async () => [
      {
        name: "Email",
        type: "EmailAddress",
        isPrimaryKey: true,
        isNullable: false,
      } satisfies DataExtensionField,
      {
        name: "First Name",
        type: "Text",
        isPrimaryKey: false,
        isNullable: true,
        length: 50,
      } satisfies DataExtensionField,
    ]);

    const result = await buildAsteriskExpansion({
      textBeforeCursor: "SELECT *",
      cursorIndex: "SELECT *".length,
      tablesInScope,
      getFieldsForTable,
    });

    expect(result.type).toBe("expand");
    const expanded = result as Extract<
      AsteriskExpansionResult,
      { type: "expand" }
    >;
    expect(getFieldsForTable).toHaveBeenCalledTimes(1);
    expect(expanded.expandedColumns).toContain("c.Email");
    expect(expanded.expandedColumns).toContain("c.[First Name]");
  });
});
