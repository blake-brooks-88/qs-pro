import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";

/**
 * SQL aggregate functions that require GROUP BY when mixed with non-aggregated columns.
 */
const AGGREGATE_FUNCTIONS = new Set(["count", "sum", "avg", "min", "max"]);

interface Token {
  type: "word" | "symbol" | "whitespace";
  value: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Tokenize SQL while respecting strings, brackets, and comments.
 */
const tokenizeSqlForAggregates = (sql: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < sql.length) {
    const char = sql.charAt(index);
    const nextChar = sql.charAt(index + 1);

    // Handle comments
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    // Handle strings
    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") {
          index += 2;
          continue;
        }
        inSingleQuote = false;
      }
      index += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      index += 1;
      continue;
    }

    // Handle brackets
    if (inBracket) {
      if (char === "]") {
        inBracket = false;
      }
      index += 1;
      continue;
    }

    // Start of comment
    if (char === "-" && nextChar === "-") {
      inLineComment = true;
      index += 2;
      continue;
    }

    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      index += 2;
      continue;
    }

    // Start of string
    if (char === "'") {
      inSingleQuote = true;
      index += 1;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      index += 1;
      continue;
    }

    // Start of bracket
    if (char === "[") {
      inBracket = true;
      index += 1;
      continue;
    }

    // Handle whitespace
    if (/\s/.test(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && /\s/.test(sql.charAt(end))) {
        end += 1;
      }
      tokens.push({
        type: "whitespace",
        value: sql.slice(start, end),
        startIndex: start,
        endIndex: end,
      });
      index = end;
      continue;
    }

    // Handle word characters
    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql.charAt(end))) {
        end += 1;
      }
      tokens.push({
        type: "word",
        value: sql.slice(start, end),
        startIndex: start,
        endIndex: end,
      });
      index = end;
      continue;
    }

    // Handle symbols
    tokens.push({
      type: "symbol",
      value: char,
      startIndex: index,
      endIndex: index + 1,
    });
    index += 1;
  }

  return tokens;
};

/**
 * Extract the SELECT clause content (between SELECT and FROM/WHERE/GROUP/ORDER/etc).
 */
const extractSelectClause = (tokens: Token[]): Token[] => {
  const selectIndex = tokens.findIndex(
    (token) => token.type === "word" && token.value.toLowerCase() === "select",
  );
  if (selectIndex === -1) return [];

  const endKeywords = ["from", "where", "group", "order", "having", "union"];
  let endIndex = tokens.length;
  for (let i = selectIndex + 1; i < tokens.length; i += 1) {
    const token = tokens.at(i);
    if (!token) continue;
    if (
      token.type === "word" &&
      endKeywords.includes(token.value.toLowerCase())
    ) {
      endIndex = i;
      break;
    }
  }

  return tokens.slice(selectIndex + 1, endIndex);
};

/**
 * Check if a query has a GROUP BY clause.
 */
const hasGroupByClause = (tokens: Token[]): boolean => {
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const currentToken = tokens.at(i);
    if (!currentToken) continue;
    if (
      currentToken.type === "word" &&
      currentToken.value.toLowerCase() === "group" &&
      i + 1 < tokens.length
    ) {
      // Skip whitespace
      let nextIndex = i + 1;
      while (nextIndex < tokens.length) {
        const nextToken = tokens.at(nextIndex);
        if (!nextToken) break;
        if (nextToken.type !== "whitespace") break;
        nextIndex += 1;
      }
      const byToken = tokens.at(nextIndex);
      if (
        byToken &&
        byToken.type === "word" &&
        byToken.value.toLowerCase() === "by"
      ) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Extract column names from GROUP BY clause.
 */
const extractGroupByColumns = (tokens: Token[]): Set<string> => {
  const groupedColumns = new Set<string>();

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const currentToken = tokens.at(i);
    if (!currentToken) continue;
    if (
      currentToken.type === "word" &&
      currentToken.value.toLowerCase() === "group"
    ) {
      // Skip to BY
      let byIndex = i + 1;
      while (byIndex < tokens.length) {
        const byToken = tokens.at(byIndex);
        if (!byToken) break;
        if (byToken.type !== "whitespace") break;
        byIndex += 1;
      }
      const byToken = tokens.at(byIndex);
      if (
        byToken &&
        byToken.type === "word" &&
        byToken.value.toLowerCase() === "by"
      ) {
        // Extract columns after BY
        let currentIndex = byIndex + 1;
        while (currentIndex < tokens.length) {
          const token = tokens.at(currentIndex);
          if (!token) break;

          // Stop at next major keyword
          if (
            token.type === "word" &&
            ["having", "order", "union", "limit", "offset"].includes(
              token.value.toLowerCase(),
            )
          ) {
            break;
          }

          // Collect column names (skip qualifiers and commas)
          if (token.type === "word") {
            // Skip table qualifiers (e.g., "t." in "t.column")
            const nextNonWhitespace = currentIndex + 1;
            const nextToken = tokens.at(nextNonWhitespace);
            if (
              nextToken &&
              nextToken.type === "symbol" &&
              nextToken.value === "."
            ) {
              // This is a table qualifier, skip it
              currentIndex += 2;
              continue;
            }

            groupedColumns.add(token.value.toLowerCase());
          }

          currentIndex += 1;
        }
        break;
      }
    }
  }

  return groupedColumns;
};

/**
 * Parse SELECT expressions and identify aggregated vs non-aggregated columns.
 */
const analyzeSelectExpressions = (
  selectTokens: Token[],
): {
  hasAggregates: boolean;
  nonAggregatedColumns: Array<{
    name: string;
    startIndex: number;
    endIndex: number;
  }>;
} => {
  let hasAggregates = false;
  const nonAggregatedColumns: Array<{
    name: string;
    startIndex: number;
    endIndex: number;
  }> = [];

  let i = 0;
  let depth = 0;
  let currentExpression: Token[] = [];

  while (i < selectTokens.length) {
    const token = selectTokens.at(i);
    if (!token) {
      i += 1;
      continue;
    }

    // Track parenthesis depth
    if (token.type === "symbol" && token.value === "(") {
      depth += 1;
    } else if (token.type === "symbol" && token.value === ")") {
      depth -= 1;
    }

    // Comma at depth 0 separates expressions
    if (token.type === "symbol" && token.value === "," && depth === 0) {
      if (currentExpression.length > 0) {
        analyzeExpression(currentExpression);
      }
      currentExpression = [];
      i += 1;
      continue;
    }

    if (token.type !== "whitespace" || currentExpression.length > 0) {
      currentExpression.push(token);
    }
    i += 1;
  }

  // Analyze last expression
  if (currentExpression.length > 0) {
    analyzeExpression(currentExpression);
  }

  function analyzeExpression(exprTokens: Token[]): void {
    // Check for aggregate functions
    let isAggregated = false;
    let isLiteral = false;
    let isStar = false;

    for (let j = 0; j < exprTokens.length; j += 1) {
      const t = exprTokens.at(j);
      if (!t) continue;

      if (t.type === "word") {
        const lowerValue = t.value.toLowerCase();

        // Check if this is an aggregate function
        if (AGGREGATE_FUNCTIONS.has(lowerValue)) {
          // Look ahead for opening parenthesis
          let nextIndex = j + 1;
          while (nextIndex < exprTokens.length) {
            const nextToken = exprTokens.at(nextIndex);
            if (!nextToken) break;
            if (nextToken.type !== "whitespace") break;
            nextIndex += 1;
          }
          const parenToken = exprTokens.at(nextIndex);
          if (
            parenToken &&
            parenToken.type === "symbol" &&
            parenToken.value === "("
          ) {
            hasAggregates = true;
            isAggregated = true;
            break;
          }
        }
      } else if (t.type === "symbol" && t.value === "*") {
        isStar = true;
      }
    }

    // Check if expression is a literal (string or number)
    const nonWhitespaceTokens = exprTokens.filter(
      (t) => t.type !== "whitespace",
    );
    if (nonWhitespaceTokens.length > 0) {
      const firstToken = nonWhitespaceTokens.at(0);
      if (firstToken) {
        if (firstToken.type === "symbol" && firstToken.value === "'") {
          isLiteral = true;
        } else if (
          firstToken.type === "word" &&
          /^\d+$/.test(firstToken.value)
        ) {
          isLiteral = true;
        }
      }
    }

    // If not aggregated and not a literal, extract column name
    if (!isAggregated && !isLiteral && exprTokens.length > 0) {
      // Find the first word token (column or table name)
      for (const t of exprTokens) {
        if (t.type === "word") {
          const lowerValue = t.value.toLowerCase();
          // Skip SQL keywords
          if (!["as", "distinct", "top"].includes(lowerValue)) {
            nonAggregatedColumns.push({
              name: t.value,
              startIndex: t.startIndex,
              endIndex: t.endIndex,
            });
            break;
          }
        }
      }

      // Special handling for SELECT *
      if (isStar) {
        const firstToken = exprTokens.at(0);
        const lastToken = exprTokens.at(exprTokens.length - 1);
        if (firstToken && lastToken) {
          nonAggregatedColumns.push({
            name: "*",
            startIndex: firstToken.startIndex,
            endIndex: lastToken.endIndex,
          });
        }
      }
    }
  }

  return { hasAggregates, nonAggregatedColumns };
};

const getAggregateGroupingDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  const tokens = tokenizeSqlForAggregates(sql);

  // Check if query has aggregates
  const selectTokens = extractSelectClause(tokens);
  if (selectTokens.length === 0) return diagnostics;

  const { hasAggregates, nonAggregatedColumns } =
    analyzeSelectExpressions(selectTokens);

  // If no aggregates, no problem
  if (!hasAggregates) return diagnostics;

  // If only aggregates (no non-aggregated columns), no problem
  if (nonAggregatedColumns.length === 0) return diagnostics;

  // Check for GROUP BY clause
  const hasGroupBy = hasGroupByClause(tokens);

  if (!hasGroupBy) {
    // Error: mixing aggregates with non-aggregated columns without GROUP BY
    for (const col of nonAggregatedColumns) {
      diagnostics.push(
        createDiagnostic(
          `Non-aggregated field "${col.name}" must appear in GROUP BY or be wrapped in an aggregate function. Example: \`GROUP BY ${col.name}\` or \`MAX(${col.name})\`.`,
          "error",
          col.startIndex,
          col.endIndex,
        ),
      );
    }
  } else {
    // Has GROUP BY - check if non-aggregated columns are in GROUP BY
    const groupedColumns = extractGroupByColumns(tokens);

    for (const col of nonAggregatedColumns) {
      const colNameLower = col.name.toLowerCase();

      // Skip * (handled by other rules)
      if (colNameLower === "*") {
        diagnostics.push(
          createDiagnostic(
            `Non-aggregated field "${col.name}" must appear in GROUP BY or be wrapped in an aggregate function. Example: \`GROUP BY ${col.name}\` or \`MAX(${col.name})\`.`,
            "error",
            col.startIndex,
            col.endIndex,
          ),
        );
        continue;
      }

      // Check if column is in GROUP BY (with or without table qualifier)
      let isGrouped = false;
      for (const groupedCol of groupedColumns) {
        if (groupedCol === colNameLower) {
          isGrouped = true;
          break;
        }
        // Also check if grouped column contains this column (e.g., "t.Region" contains "Region")
        if (groupedCol.includes(colNameLower)) {
          isGrouped = true;
          break;
        }
      }

      if (!isGrouped) {
        diagnostics.push(
          createDiagnostic(
            `Non-aggregated field "${col.name}" must appear in GROUP BY or be wrapped in an aggregate function. Example: \`GROUP BY ${col.name}\` or \`MAX(${col.name})\`.`,
            "error",
            col.startIndex,
            col.endIndex,
          ),
        );
      }
    }
  }

  return diagnostics;
};

/**
 * Rule to detect SELECT statements mixing aggregate functions with non-aggregated columns
 * without proper GROUP BY clause.
 */
export const aggregateGroupingRule: LintRule = {
  id: "aggregate-grouping",
  name: "Aggregate Grouping",
  check: (context: LintContext) => {
    return getAggregateGroupingDiagnostics(context.sql);
  },
};
