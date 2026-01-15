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

const skipWhitespace = (value: string, index: number): number => {
  let i = index;
  while (i < value.length && /\s/.test(value.charAt(i))) {
    i += 1;
  }
  return i;
};

const isIdentifierChar = (char: string): boolean => {
  return /[A-Za-z0-9_]/.test(char);
};

const parseBracketedIdentifierEnd = (
  value: string,
  index: number,
): number | null => {
  if (value.charAt(index) !== "[") return null;
  let i = index + 1;
  while (i < value.length) {
    const char = value.charAt(i);
    const nextChar = value.charAt(i + 1);
    if (char === "]") {
      if (nextChar === "]") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return null;
};

const parseUnbracketedIdentifierEnd = (
  value: string,
  index: number,
): number | null => {
  if (!isIdentifierChar(value.charAt(index))) return null;
  let i = index + 1;
  while (i < value.length && isIdentifierChar(value.charAt(i))) {
    i += 1;
  }
  return i;
};

const parseAliasSuffix = (value: string, index: number): boolean => {
  let i = skipWhitespace(value, index);
  if (i >= value.length) return true;

  const tryParseAlias = (start: number): number | null => {
    const bracketEnd = parseBracketedIdentifierEnd(value, start);
    if (bracketEnd !== null) return bracketEnd;
    return parseUnbracketedIdentifierEnd(value, start);
  };

  const wordEnd = parseUnbracketedIdentifierEnd(value, i);
  if (wordEnd !== null) {
    const firstWord = value.slice(i, wordEnd).toLowerCase();
    if (firstWord === "as") {
      i = skipWhitespace(value, wordEnd);
      const aliasEnd = tryParseAlias(i);
      if (aliasEnd === null) return false;
      return skipWhitespace(value, aliasEnd) >= value.length;
    }

    const aliasEnd = wordEnd;
    return skipWhitespace(value, aliasEnd) >= value.length;
  }

  const aliasEnd = tryParseAlias(i);
  if (aliasEnd === null) return false;
  return skipWhitespace(value, aliasEnd) >= value.length;
};

const parseStringLiteralEnd = (value: string, index: number): number | null => {
  if (value.charAt(index) !== "'") return null;
  let i = index + 1;
  while (i < value.length) {
    const char = value.charAt(i);
    const nextChar = value.charAt(i + 1);
    if (char === "'") {
      if (nextChar === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return null;
};

const parseNumberLiteralEnd = (value: string, index: number): number | null => {
  const firstChar = value.charAt(index);
  if (firstChar < "0" || firstChar > "9") return null;

  let i = index;
  while (i < value.length) {
    const char = value.charAt(i);
    if (char < "0" || char > "9") break;
    i += 1;
  }

  if (value.charAt(i) === ".") {
    const decimalStart = i + 1;
    const decimalFirst = value.charAt(decimalStart);
    if (decimalFirst < "0" || decimalFirst > "9") return null;

    i = decimalStart + 1;
    while (i < value.length) {
      const char = value.charAt(i);
      if (char < "0" || char > "9") break;
      i += 1;
    }
  }

  return i;
};

const parseKeywordLiteralEnd = (
  value: string,
  index: number,
): number | null => {
  const remaining = value.slice(index).toLowerCase();
  const keywords = ["true", "false", "null"] as const;

  for (const keyword of keywords) {
    if (!remaining.startsWith(keyword)) continue;
    const end = index + keyword.length;
    const nextChar = value.charAt(end);
    if (nextChar && isIdentifierChar(nextChar)) return null;
    return end;
  }

  return null;
};

const isLiteralExpression = (expression: string) => {
  const start = skipWhitespace(expression, 0);
  if (start >= expression.length) return false;

  const stringEnd = parseStringLiteralEnd(expression, start);
  if (stringEnd !== null) return parseAliasSuffix(expression, stringEnd);

  const numberEnd = parseNumberLiteralEnd(expression, start);
  if (numberEnd !== null) return parseAliasSuffix(expression, numberEnd);

  const keywordEnd = parseKeywordLiteralEnd(expression, start);
  if (keywordEnd !== null) return parseAliasSuffix(expression, keywordEnd);

  return false;
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
