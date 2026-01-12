import type { SqlCursorContext, SqlTableReference } from "../sql-context";
import type { DataExtensionField } from "@/features/editor-workspace/types";

/**
 * Context provided to inline suggestion rules for evaluation.
 */
export interface InlineSuggestionContext {
  /** The full SQL text */
  sql: string;
  /** Cursor position as character offset */
  cursorIndex: number;
  /** Parsed SQL context from getSqlCursorContext */
  sqlContext: SqlCursorContext;
  /** Tables visible at current scope depth */
  tablesInScope: SqlTableReference[];
  /** Set of existing alias names (lowercase) for collision detection */
  existingAliases: Set<string>;
  /**
   * Async function to fetch fields for a table.
   * Lazy-loaded to avoid unnecessary API calls.
   */
  getFieldsForTable: (
    table: SqlTableReference,
  ) => Promise<DataExtensionField[]>;
}

/**
 * A suggestion to show as ghost text in the editor.
 */
export interface InlineSuggestion {
  /** The ghost text to insert */
  text: string;
  /** Higher priority wins when multiple rules match (default: 0) */
  priority: number;
  /** Alternative suggestions for Ctrl+Space dropdown */
  alternatives?: string[];
}

/**
 * A rule that determines when and what inline suggestions to show.
 *
 * Rules are evaluated in priority order. First matching rule wins.
 */
export interface InlineSuggestionRule {
  /** Unique identifier for debugging */
  id: string;
  /** Check if this rule applies to the current context */
  matches: (ctx: InlineSuggestionContext) => boolean;
  /** Generate the suggestion. Return null to skip this rule. */
  getSuggestion: (
    ctx: InlineSuggestionContext,
  ) => Promise<InlineSuggestion | null>;
}
