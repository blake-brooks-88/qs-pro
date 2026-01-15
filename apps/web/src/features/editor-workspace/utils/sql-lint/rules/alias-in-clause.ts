import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

interface ColumnAlias {
  alias: string;
  aliasLower: string;
}

interface ClauseLocation {
  name: string;
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
 * Extracts column aliases from the SELECT clause.
 * Handles: AS alias, AS [alias], expression alias (no AS keyword)
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
    aliases.push({
      alias,
      aliasLower: alias.toLowerCase(),
    });
  }

  // Pattern 2: AS identifier (not bracketed)
  const identifierAsPattern = /\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi;
  while ((match = identifierAsPattern.exec(selectClause)) !== null) {
    const alias = match[1];
    aliases.push({
      alias,
      aliasLower: alias.toLowerCase(),
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
      aliases.push({
        alias,
        aliasLower,
      });
    }
  }

  return aliases;
};

/**
 * Extracts table aliases from FROM and JOIN clauses.
 * These should NOT be flagged as errors.
 */
const extractTableAliases = (sql: string): Set<string> => {
  const tableAliases = new Set<string>();
  const cleanSql = removeComments(sql);

  // Pattern: FROM [TableName] alias or FROM [TableName] AS alias
  // Also handles: JOIN [TableName] alias
  const tableAliasPattern =
    /\b(?:FROM|JOIN)\s+(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/gi;

  let match: RegExpExecArray | null;
  while ((match = tableAliasPattern.exec(cleanSql)) !== null) {
    const alias = match[1].toLowerCase();
    // Skip keywords that might be matched
    if (
      ![
        "on",
        "where",
        "and",
        "or",
        "join",
        "left",
        "right",
        "inner",
        "outer",
        "cross",
        "full",
      ].includes(alias)
    ) {
      tableAliases.add(alias);
    }
  }

  return tableAliases;
};

/**
 * Creates a parser for scanning SQL while respecting quotes and comments.
 */
const createParser = (sql: string) => {
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

  const skipQuotesAndComments = (): boolean => {
    const char = sql.charAt(index);
    const nextChar = sql.charAt(index + 1);

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      index += 1;
      return true;
    }

    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        index += 2;
        return true;
      }
      index += 1;
      return true;
    }

    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") {
          index += 2;
          return true;
        }
        inSingleQuote = false;
      }
      index += 1;
      return true;
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      index += 1;
      return true;
    }

    if (inBracket) {
      if (char === "]") {
        inBracket = false;
      }
      index += 1;
      return true;
    }

    if (char === "-" && nextChar === "-") {
      inLineComment = true;
      index += 2;
      return true;
    }

    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      index += 2;
      return true;
    }

    if (char === "'") {
      inSingleQuote = true;
      index += 1;
      return true;
    }

    if (char === '"') {
      inDoubleQuote = true;
      index += 1;
      return true;
    }

    if (char === "[") {
      inBracket = true;
      index += 1;
      return true;
    }

    return false;
  };

  return {
    get index() {
      return index;
    },
    set index(val: number) {
      index = val;
    },
    skipQuotesAndComments,
    advance: () => {
      index += 1;
    },
    char: () => sql.charAt(index),
    atEnd: () => index >= sql.length,
  };
};

/**
 * Finds clauses where aliases cannot be used: WHERE, HAVING, ORDER BY, GROUP BY
 */
const findRestrictedClauses = (sql: string): ClauseLocation[] => {
  const clauses: ClauseLocation[] = [];
  const parser = createParser(sql);
  const sqlLower = sql.toLowerCase();

  // Keywords that end a clause
  const clauseEnders = new Set([
    "from",
    "where",
    "group",
    "having",
    "order",
    "union",
    "except",
    "intersect",
    "limit",
    "offset",
  ]);

  while (!parser.atEnd()) {
    if (parser.skipQuotesAndComments()) continue;

    if (isWordChar(parser.char())) {
      const start = parser.index;
      let end = start + 1;
      while (end < sql.length && isWordChar(sql.charAt(end))) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();
      parser.index = end;

      // Check for ORDER BY and GROUP BY
      if (word === "order" || word === "group") {
        // Skip whitespace
        let pos = end;
        while (pos < sql.length && /\s/.test(sql.charAt(pos))) {
          pos += 1;
        }

        // Check for BY
        if (sqlLower.slice(pos, pos + 2) === "by") {
          const clauseStart = pos + 2;
          // Find end of clause
          let clauseEnd = sql.length;
          const subParser = createParser(sql);
          subParser.index = clauseStart;

          while (!subParser.atEnd()) {
            if (subParser.skipQuotesAndComments()) continue;

            if (isWordChar(subParser.char())) {
              const wStart = subParser.index;
              let wEnd = wStart + 1;
              while (wEnd < sql.length && isWordChar(sql.charAt(wEnd))) {
                wEnd += 1;
              }
              const w = sql.slice(wStart, wEnd).toLowerCase();

              if (clauseEnders.has(w) && w !== word) {
                clauseEnd = wStart;
                break;
              }
              subParser.index = wEnd;
              continue;
            }
            subParser.advance();
          }

          clauses.push({
            name: word === "order" ? "ORDER BY" : "GROUP BY",
            startIndex: clauseStart,
            endIndex: clauseEnd,
          });

          parser.index = clauseStart;
        }
        continue;
      }

      // Check for WHERE and HAVING
      if (word === "where" || word === "having") {
        const clauseStart = end;
        // Find end of clause
        let clauseEnd = sql.length;
        const subParser = createParser(sql);
        subParser.index = clauseStart;

        while (!subParser.atEnd()) {
          if (subParser.skipQuotesAndComments()) continue;

          if (isWordChar(subParser.char())) {
            const wStart = subParser.index;
            let wEnd = wStart + 1;
            while (wEnd < sql.length && isWordChar(sql.charAt(wEnd))) {
              wEnd += 1;
            }
            const w = sql.slice(wStart, wEnd).toLowerCase();

            if (clauseEnders.has(w) && w !== word) {
              clauseEnd = wStart;
              break;
            }
            subParser.index = wEnd;
            continue;
          }
          subParser.advance();
        }

        clauses.push({
          name: word.toUpperCase(),
          startIndex: clauseStart,
          endIndex: clauseEnd,
        });
      }

      continue;
    }

    parser.advance();
  }

  return clauses;
};

/**
 * Checks for column aliases used in restricted clauses.
 */
const getAliasInClauseDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];

  const columnAliases = extractColumnAliases(sql);
  if (columnAliases.length === 0) return diagnostics;

  const tableAliases = extractTableAliases(sql);
  const restrictedClauses = findRestrictedClauses(sql);

  // SQL keywords to skip
  const sqlKeywords = new Set([
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
    "asc",
    "desc",
    "by",
    "nulls",
    "first",
    "last",
  ]);

  for (const clause of restrictedClauses) {
    const clauseText = sql.slice(clause.startIndex, clause.endIndex);
    let i = 0;
    let inSingleQuote = false;
    let inLineComment = false;
    let inBlockComment = false;

    while (i < clauseText.length) {
      const char = clauseText.charAt(i);
      const nextChar = clauseText.charAt(i + 1);

      // Handle comments
      if (inLineComment) {
        if (char === "\n") inLineComment = false;
        i++;
        continue;
      }
      if (inBlockComment) {
        if (char === "*" && nextChar === "/") {
          inBlockComment = false;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (char === "-" && nextChar === "-") {
        inLineComment = true;
        i += 2;
        continue;
      }
      if (char === "/" && nextChar === "*") {
        inBlockComment = true;
        i += 2;
        continue;
      }

      // Handle string literals
      if (inSingleQuote) {
        if (char === "'") {
          if (nextChar === "'") {
            i += 2;
            continue;
          }
          inSingleQuote = false;
        }
        i++;
        continue;
      }
      if (char === "'") {
        inSingleQuote = true;
        i++;
        continue;
      }

      // Check for bracketed identifier
      if (char === "[") {
        const bracketStart = i;
        i++;
        while (i < clauseText.length && clauseText.charAt(i) !== "]") {
          i++;
        }
        if (i < clauseText.length) {
          const bracketContent = clauseText.slice(bracketStart + 1, i);
          const fullBracket = `[${bracketContent}]`;
          const fullBracketLower = fullBracket.toLowerCase();

          // Check if this matches a column alias
          for (const alias of columnAliases) {
            if (alias.aliasLower === fullBracketLower) {
              const absoluteStart = clause.startIndex + bracketStart;
              const absoluteEnd = clause.startIndex + i + 1;
              diagnostics.push(
                createDiagnostic(
                  `Column alias "${alias.alias}" cannot be used in ${clause.name}. ${MC.SHORT} requires the original expression.`,
                  "error",
                  absoluteStart,
                  absoluteEnd,
                ),
              );
              break;
            }
          }
          i++;
        }
        continue;
      }

      // Check for word token
      if (isWordChar(char)) {
        const start = i;
        while (i < clauseText.length && isWordChar(clauseText.charAt(i))) {
          i++;
        }
        const word = clauseText.slice(start, i);
        const wordLower = word.toLowerCase();

        // Skip table aliases and SQL keywords
        if (tableAliases.has(wordLower) || sqlKeywords.has(wordLower)) {
          continue;
        }

        // Check if this matches a column alias
        for (const alias of columnAliases) {
          if (alias.aliasLower === wordLower) {
            const absoluteStart = clause.startIndex + start;
            const absoluteEnd = clause.startIndex + i;
            diagnostics.push(
              createDiagnostic(
                `Column alias "${alias.alias}" cannot be used in ${clause.name}. ${MC.SHORT} requires the original expression.`,
                "error",
                absoluteStart,
                absoluteEnd,
              ),
            );
            break;
          }
        }
        continue;
      }

      i++;
    }
  }

  return diagnostics;
};

/**
 * Rule to detect column aliases used in WHERE, HAVING, ORDER BY, or GROUP BY clauses.
 * MCE SQL does not support referencing column aliases in these clauses.
 */
export const aliasInClauseRule: LintRule = {
  id: "alias-in-clause",
  name: "Alias in Clause",
  check: (context: LintContext) => {
    return getAliasInClauseDiagnostics(context.sql);
  },
};
