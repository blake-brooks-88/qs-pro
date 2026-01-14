import type { SqlToken } from "../../../sql-context";
import { tokenizeSql } from "./tokenizer";

export interface FromJoinTarget {
  keyword: "from" | "join";
  startIndex: number;
  endIndex: number;
  rawText: string;
  wordCount: number;
  hasHyphen: boolean;
  hasDot: boolean;
  hasEntPrefix: boolean;
  isBracketed: boolean;
  isSubquery: boolean;
}

const CLAUSE_BOUNDARIES = new Set([
  "on",
  "where",
  "group",
  "order",
  "having",
  "union",
  "except",
  "intersect",
]);

const JOIN_BOUNDARIES = new Set([
  "join",
  "inner",
  "left",
  "right",
  "full",
  "cross",
]);

const isClauseBoundary = (token: SqlToken): boolean => {
  if (token.type !== "word") return false;
  const lower = token.value.toLowerCase();
  return CLAUSE_BOUNDARIES.has(lower) || JOIN_BOUNDARIES.has(lower);
};

const isFromOrJoin = (token: SqlToken): "from" | "join" | null => {
  if (token.type !== "word") return null;
  const lower = token.value.toLowerCase();
  if (lower === "from") return "from";
  if (lower === "join") return "join";
  return null;
};

/**
 * Extracts FROM/JOIN target runs from SQL, working even with syntactically invalid SQL.
 * Returns metadata about each target including position, word count, and structural flags.
 */
export const extractFromJoinTargets = (sql: string): FromJoinTarget[] => {
  const tokens = tokenizeSql(sql);
  const targets: FromJoinTarget[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const keyword = isFromOrJoin(token);
    if (!keyword) continue;

    const baseDepth = token.depth;
    let nextIndex = i + 1;

    // Skip any commas immediately after FROM/JOIN
    while (
      tokens[nextIndex] &&
      tokens[nextIndex].type === "symbol" &&
      tokens[nextIndex].value === ","
    ) {
      nextIndex += 1;
    }

    const nextToken = tokens[nextIndex];
    if (!nextToken) continue;

    // Handle subquery: FROM (SELECT ...)
    if (nextToken.type === "symbol" && nextToken.value === "(") {
      targets.push({
        keyword,
        startIndex: nextToken.startIndex,
        endIndex: nextToken.endIndex,
        rawText: "(",
        wordCount: 0,
        hasHyphen: false,
        hasDot: false,
        hasEntPrefix: false,
        isBracketed: false,
        isSubquery: true,
      });
      continue;
    }

    // Handle bracketed identifier: FROM [My Data Extension]
    if (nextToken.type === "bracket") {
      targets.push({
        keyword,
        startIndex: nextToken.startIndex,
        endIndex: nextToken.endIndex,
        rawText: sql.slice(nextToken.startIndex, nextToken.endIndex),
        wordCount: 1,
        hasHyphen: nextToken.value.includes("-"),
        hasDot: nextToken.value.includes("."),
        hasEntPrefix: false,
        isBracketed: true,
        isSubquery: false,
      });
      continue;
    }

    // Collect identifier run with allowed connectors (. and -)
    const runTokens: SqlToken[] = [];
    let runIndex = nextIndex;
    let lastWasIdentifier = false;

    while (runIndex < tokens.length) {
      const current = tokens[runIndex];

      // Stop at depth changes
      if (current.depth !== baseDepth) break;

      // Stop at clause/join boundaries
      if (isClauseBoundary(current)) break;

      // Stop at comma
      if (current.type === "symbol" && current.value === ",") break;

      // Handle word tokens (identifiers)
      if (current.type === "word") {
        runTokens.push(current);
        lastWasIdentifier = true;
        runIndex += 1;
        continue;
      }

      // Handle bracket tokens as part of ENT.[Bracketed Name] patterns
      if (current.type === "bracket") {
        runTokens.push(current);
        lastWasIdentifier = true;
        runIndex += 1;
        continue;
      }

      // Handle dot and hyphen connectors only between identifiers
      if (
        current.type === "symbol" &&
        (current.value === "." || current.value === "-")
      ) {
        if (lastWasIdentifier) {
          const peekNext = tokens[runIndex + 1];
          // Only include connector if followed by word or bracket at same depth
          if (
            peekNext &&
            peekNext.depth === baseDepth &&
            (peekNext.type === "word" || peekNext.type === "bracket")
          ) {
            runTokens.push(current);
            lastWasIdentifier = false;
            runIndex += 1;
            continue;
          }
        }
        // Stop if connector not between identifiers
        break;
      }

      // Stop at any other symbol
      break;
    }

    if (runTokens.length === 0) continue;

    const startIndex = runTokens[0].startIndex;
    const endIndex = runTokens[runTokens.length - 1].endIndex;
    const rawText = sql.slice(startIndex, endIndex);

    // Detect ENT. prefix
    const hasEntPrefix =
      runTokens.length >= 2 &&
      runTokens[0].type === "word" &&
      runTokens[0].value.toLowerCase() === "ent" &&
      runTokens[1].type === "symbol" &&
      runTokens[1].value === ".";

    // Count word tokens, excluding ENT if it's part of ENT. prefix
    let wordCount = 0;
    for (let j = 0; j < runTokens.length; j += 1) {
      const t = runTokens[j];
      if (t.type === "word" || t.type === "bracket") {
        // Skip counting ENT when it's part of ENT. prefix
        if (
          hasEntPrefix &&
          j === 0 &&
          t.type === "word" &&
          t.value.toLowerCase() === "ent"
        ) {
          continue;
        }
        wordCount += 1;
      }
    }

    // Check for hyphens in the raw text (tokenizer may skip `-` characters)
    const hasHyphen =
      rawText.includes("-") ||
      runTokens.some((t) => t.type === "symbol" && t.value === "-");
    const hasDot = runTokens.some(
      (t) => t.type === "symbol" && t.value === ".",
    );

    // Check if the target portion (after ENT. if present) is bracketed
    const isBracketed = hasEntPrefix
      ? runTokens.length >= 3 && runTokens[2].type === "bracket"
      : runTokens[0].type === "bracket";

    targets.push({
      keyword,
      startIndex,
      endIndex,
      rawText,
      wordCount,
      hasHyphen,
      hasDot,
      hasEntPrefix,
      isBracketed,
      isSubquery: false,
    });
  }

  return targets;
};
