import type { DataExtensionField } from "@/features/editor-workspace/types";

export interface TableInScopeForExpansion {
  name: string;
  alias?: string | null;
  isSubquery: boolean;
  outputFields: string[];
}

export type AsteriskExpansionResult =
  | { type: "none" }
  | { type: "issue"; message: string; detail: string }
  | {
      type: "expand";
      expandedColumns: string;
      columnCount: number;
      replaceOffsets: { startOffset: number; endOffset: number };
    };

function formatColumnName(fieldName: string): string {
  return fieldName.includes(" ") ? `[${fieldName}]` : fieldName;
}

export async function buildAsteriskExpansion(options: {
  textBeforeCursor: string;
  cursorIndex: number;
  tablesInScope: TableInScopeForExpansion[];
  getFieldsForTable: (
    table: TableInScopeForExpansion,
  ) => Promise<DataExtensionField[]>;
}): Promise<AsteriskExpansionResult> {
  const { textBeforeCursor, cursorIndex, tablesInScope, getFieldsForTable } =
    options;

  const tablesWithoutAliases = tablesInScope.filter((t) => !t.alias);
  if (tablesWithoutAliases.length > 1) {
    return {
      type: "issue",
      message: "⚠️ Cannot expand: multiple tables without aliases",
      detail: "Add table aliases to disambiguate columns",
    };
  }

  const columnList: string[] = [];

  for (const table of tablesInScope) {
    const fields = table.isSubquery
      ? table.outputFields.map((name) => ({
          name,
          type: "Text" as const,
          isPrimaryKey: false,
          isNullable: true,
        }))
      : await getFieldsForTable(table);

    const prefix = table.alias ?? "";

    for (const field of fields) {
      const fullName = prefix
        ? `${prefix}.${formatColumnName(field.name)}`
        : formatColumnName(field.name);
      columnList.push(fullName);
    }
  }

  if (columnList.length === 0) {
    return { type: "none" };
  }

  const hasTrailingAsterisk = /\*$/u.test(textBeforeCursor);
  if (!hasTrailingAsterisk) {
    return { type: "none" };
  }

  const expandedColumns = columnList.join(",\n  ");
  const asteriskOffset = textBeforeCursor.length - 1;

  return {
    type: "expand",
    expandedColumns,
    columnCount: columnList.length,
    replaceOffsets: {
      startOffset: asteriskOffset,
      endOffset: cursorIndex,
    },
  };
}
