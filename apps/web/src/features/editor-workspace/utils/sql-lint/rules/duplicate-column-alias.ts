import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

interface ColumnAlias {
  alias: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Removes comments from SQL to avoid false matches.
 */
const removeComments = (sql: string): string => {
  let result = "";
  let i = 0;

  while (i < sql.length) {
    const char = sql.charAt(i);
    const nextChar = sql.charAt(i + 1);

    // Line comment
    if (char === "-" && nextChar === "-") {
      while (i < sql.length && sql.charAt(i) !== "\n") {
        result += " ";
        i++;
      }
      continue;
    }

    // Block comment
    if (char === "/" && nextChar === "*") {
      result += "  ";
      i += 2;
      while (
        i < sql.length &&
        !(sql.charAt(i) === "*" && sql.charAt(i + 1) === "/")
      ) {
        result += " ";
        i++;
      }
      if (i < sql.length) {
        result += "  ";
        i += 2;
      }
      continue;
    }

    result += char;
    i++;
  }

  return result;
};

/**
 * Extracts column aliases from the SELECT clause with their positions.
 */
const extractColumnAliases = (sql: string): ColumnAlias[] => {
  const aliases: ColumnAlias[] = [];
  const cleanSql = removeComments(sql);

  // Find SELECT clause boundaries
  const selectMatch = cleanSql.match(/\bSELECT\b/i);
  if (!selectMatch || selectMatch.index === undefined) return aliases;

  const selectStart = selectMatch.index + 6;

  // Find end of SELECT clause
  const afterSelect = cleanSql.slice(selectStart);
  const clauseMatch = afterSelect.match(
    /\b(FROM|WHERE|ORDER|GROUP|HAVING|UNION|EXCEPT|INTERSECT)\b/i,
  );
  const selectEnd =
    clauseMatch && clauseMatch.index !== undefined
      ? selectStart + clauseMatch.index
      : cleanSql.length;

  const selectClause = cleanSql.slice(selectStart, selectEnd);

  // Pattern 1: AS [bracketed alias]
  const bracketedAsPattern = /\bAS\s+(\[[^\]]+\])/gi;
  let match: RegExpExecArray | null;
  while ((match = bracketedAsPattern.exec(selectClause)) !== null) {
    const alias = match[1];
    const absoluteStart = selectStart + match.index + match[0].indexOf(alias);
    aliases.push({
      alias,
      startIndex: absoluteStart,
      endIndex: absoluteStart + alias.length,
    });
  }

  // Pattern 2: AS identifier (not bracketed)
  const identifierAsPattern = /\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi;
  while ((match = identifierAsPattern.exec(selectClause)) !== null) {
    const alias = match[1];
    const absoluteStart = selectStart + match.index + match[0].indexOf(alias);
    aliases.push({
      alias,
      startIndex: absoluteStart,
      endIndex: absoluteStart + alias.length,
    });
  }

  // Pattern 3: Implicit alias after closing paren - ) identifier,
  // This catches things like SUM(amount) total
  const implicitAliasPattern = /\)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:,|$)/g;
  while ((match = implicitAliasPattern.exec(selectClause)) !== null) {
    const alias = match[1];
    const aliasLower = alias.toLowerCase();
    // Skip SQL keywords
    const sqlKeywords = new Set([
      "as",
      "and",
      "or",
      "not",
      "in",
      "is",
      "null",
      "like",
      "between",
      "case",
      "when",
      "then",
      "else",
      "end",
      "from",
      "where",
      "order",
      "group",
      "having",
    ]);
    if (!sqlKeywords.has(aliasLower)) {
      const absoluteStart = selectStart + match.index + match[0].indexOf(alias);
      aliases.push({
        alias,
        startIndex: absoluteStart,
        endIndex: absoluteStart + alias.length,
      });
    }
  }

  return aliases;
};

/**
 * Detects duplicate column aliases in SELECT clause.
 */
const getDuplicateColumnAliasDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  const columnAliases = extractColumnAliases(sql);

  if (columnAliases.length === 0) return diagnostics;

  // Track aliases we've seen
  const aliasMap = new Map<string, ColumnAlias[]>();

  for (const colAlias of columnAliases) {
    const aliasLower = colAlias.alias.toLowerCase();
    const existing = aliasMap.get(aliasLower) ?? [];
    existing.push(colAlias);
    aliasMap.set(aliasLower, existing);
  }

  // Report duplicates
  for (const [, occurrences] of aliasMap) {
    if (occurrences.length > 1) {
      // Mark all occurrences after the first as errors
      for (let i = 1; i < occurrences.length; i++) {
        const occurrence = occurrences.at(i);
        if (!occurrence) continue;
        diagnostics.push(
          createDiagnostic(
            `Duplicate column alias "${occurrence.alias}" — each column must have a unique alias. ${MC.SHORT} requires distinct column names in SELECT.`,
            "error",
            occurrence.startIndex,
            occurrence.endIndex,
          ),
        );
      }
    }
  }

  return diagnostics;
};

/**
 * Rule to detect duplicate column aliases in SELECT clause.
 * MCE SQL requires each column in the SELECT list to have a unique alias.
 */
export const duplicateColumnAliasRule: LintRule = {
  id: "duplicate-column-alias",
  name: "Duplicate Column Alias",
  check: (context: LintContext) => {
    return getDuplicateColumnAliasDiagnostics(context.sql);
  },
};
