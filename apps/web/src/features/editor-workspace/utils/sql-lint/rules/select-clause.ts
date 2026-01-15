import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";
import { extractTableReferences } from "../../sql-context";

const splitSelectExpressions = (clause: string) => {
  const expressions: string[] = [];
  let current = "";
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;

  for (let index = 0; index < clause.length; index += 1) {
    const char = clause.charAt(index);
    const nextChar = clause.charAt(index + 1);

    if (inSingleQuote) {
      current += char;
      if (char === "'" && nextChar === "'") {
        current += nextChar;
        index += 1;
        continue;
      }
      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inBracket) {
      current += char;
      if (char === "]") {
        inBracket = false;
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }

    if (char === "[") {
      inBracket = true;
      current += char;
      continue;
    }

    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      if (current.trim()) {
        expressions.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    expressions.push(current.trim());
  }

  return expressions;
};

const isLiteralExpression = (expression: string) => {
  // Match string literal: 'text' or 'text''with''escapes'
  // Using [^']*(?:''[^']*)* pattern to avoid ReDoS (no alternation inside quantifier)
  const stringLiteralPattern =
    /^\s*'[^']*(?:''[^']*)*'\s*(?:as\s+)?\[?[A-Za-z0-9_\s]+\]?\s*$/i;
  const numberPattern =
    /^\s*\d+(?:\.\d+)?\s*(?:as\s+)?\[?[A-Za-z0-9_\s]+\]?\s*$/i;
  const keywordPattern =
    /^\s*(?:true|false|null)\s*(?:as\s+)?\[?[A-Za-z0-9_\s]+\]?\s*$/i;

  return (
    stringLiteralPattern.test(expression) ||
    numberPattern.test(expression) ||
    keywordPattern.test(expression)
  );
};

const hasAlias = (expression: string) => {
  if (/\bas\s+\[?[A-Za-z0-9_\s]+\]?\s*$/i.test(expression)) return true;
  return /\s+\[?[A-Za-z0-9_\s]+\]?\s*$/i.test(expression);
};

const getSelectDiagnostics = (
  sql: string,
  tokens: LintContext["tokens"],
): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  const selectToken = tokens.find(
    (token) => token.type === "word" && token.value.toLowerCase() === "select",
  );
  if (!selectToken) {
    diagnostics.push(
      createDiagnostic(
        "Query must include a SELECT statement.",
        "prereq",
        0,
        Math.min(6, sql.length),
      ),
    );
    return diagnostics;
  }

  const fromToken = tokens.find(
    (token) =>
      token.type === "word" &&
      token.value.toLowerCase() === "from" &&
      token.startIndex > selectToken.startIndex,
  );
  const clauseStart = selectToken.endIndex;
  const clauseEnd = fromToken ? fromToken.startIndex : sql.length;
  const clause = sql.slice(clauseStart, clauseEnd).trim();

  if (!clause) {
    diagnostics.push(
      createDiagnostic(
        "SELECT must include at least one field or expression.",
        "prereq",
        selectToken.startIndex,
        selectToken.endIndex,
      ),
    );
    return diagnostics;
  }

  const expressions = splitSelectExpressions(clause);
  if (expressions.length === 0) {
    diagnostics.push(
      createDiagnostic(
        "SELECT must include at least one field or expression.",
        "prereq",
        selectToken.startIndex,
        selectToken.endIndex,
      ),
    );
    return diagnostics;
  }

  const nonLiteralExpressions = expressions.filter(
    (expression) => !isLiteralExpression(expression),
  );
  const literalWithoutAlias = expressions.some(
    (expression) => isLiteralExpression(expression) && !hasAlias(expression),
  );

  if (literalWithoutAlias) {
    diagnostics.push(
      createDiagnostic(
        "Literal SELECT expressions must include an alias.",
        "error",
        clauseStart,
        clauseEnd,
      ),
    );
  }

  const hasFrom = Boolean(fromToken);
  if (!hasFrom && nonLiteralExpressions.length > 0) {
    diagnostics.push(
      createDiagnostic(
        "SELECT fields require a FROM clause.",
        "prereq",
        clauseStart,
        clauseEnd,
      ),
    );
    return diagnostics;
  }

  if (hasFrom && fromToken) {
    const references = extractTableReferences(sql).filter(
      (reference) => !reference.isSubquery,
    );
    if (references.length === 0 && nonLiteralExpressions.length > 0) {
      diagnostics.push(
        createDiagnostic(
          "FROM clause must include a Data Extension.",
          "prereq",
          fromToken.startIndex,
          fromToken.endIndex,
        ),
      );
    }
  }

  return diagnostics;
};

/**
 * Rule to validate SELECT clause structure and requirements.
 */
export const selectClauseRule: LintRule = {
  id: "select-clause",
  name: "SELECT Clause Validation",
  check: (context: LintContext) => {
    return getSelectDiagnostics(context.sql, context.tokens);
  },
};
