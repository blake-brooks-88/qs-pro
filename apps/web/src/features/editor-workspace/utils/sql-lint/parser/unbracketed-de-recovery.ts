/**
 * Unbracketed Data Extension Name Recovery
 *
 * When the parser fails with a syntax error, this module attempts to detect
 * if the error is caused by an unbracketed multi-word Data Extension name.
 * If detected, it returns an actionable diagnostic instead of the generic parse error.
 */

import type { SqlDiagnostic } from "../types";
import { extractFromJoinTargets } from "../utils/extract-from-join-targets";

/**
 * Proximity threshold (in characters) for matching error offset to target span.
 * Allows for "unexpected token right after" scenarios.
 */
const OFFSET_PROXIMITY = 2;

/**
 * Check if an error offset is within or near a target span.
 */
const isNearTarget = (
  errorOffset: number,
  targetStart: number,
  targetEnd: number,
): boolean => {
  // Error is within the target span
  if (errorOffset >= targetStart && errorOffset <= targetEnd) {
    return true;
  }
  // Error is just after the target span (within OFFSET_PROXIMITY)
  if (errorOffset > targetEnd && errorOffset <= targetEnd + OFFSET_PROXIMITY) {
    return true;
  }
  return false;
};

/**
 * Create an actionable error message for the recovery diagnostic.
 */
const createRecoveryMessage = (
  rawText: string,
  hasEntPrefix: boolean,
): string => {
  const cleanedName = rawText.replace(/\s+/g, " ").trim();

  if (hasEntPrefix) {
    const afterEnt = cleanedName.replace(/^ENT\.\s*/i, "");
    return `Data Extension name requires brackets. Use: FROM ENT.[${afterEnt}]`;
  }

  return `Data Extension name requires brackets. Use: FROM [${cleanedName}]`;
};

/**
 * Attempt to recover from a parse error by detecting unbracketed DE names.
 *
 * This function is called when the parser fails. It checks if the error
 * location corresponds to an unbracketed multi-word Data Extension name
 * (3+ words or containing hyphens).
 *
 * @param sql - The SQL string that failed to parse
 * @param errorOffset - The character offset where the parser error occurred (if available)
 * @returns Diagnostics if recovery is possible, empty array otherwise
 */
export function tryRecoverUnbracketedDE(
  sql: string,
  errorOffset: number | undefined,
): SqlDiagnostic[] {
  // Can't do proximity matching without an error offset
  if (errorOffset === undefined) {
    return [];
  }

  const targets = extractFromJoinTargets(sql);

  for (const target of targets) {
    // Skip subqueries and bracketed names
    if (target.isSubquery || target.isBracketed) continue;

    // Skip dot-qualified names unless they have ENT. prefix
    if (target.hasDot && !target.hasEntPrefix) continue;

    // Only recover for high-confidence cases: 3+ words with spaces
    const hasSpaces = target.rawText.includes(" ");
    if (target.wordCount < 3 || !hasSpaces) continue;

    // Check if the error is near this target
    if (isNearTarget(errorOffset, target.startIndex, target.endIndex)) {
      return [
        {
          message: createRecoveryMessage(target.rawText, target.hasEntPrefix),
          severity: "error",
          startIndex: target.startIndex,
          endIndex: target.endIndex,
        },
      ];
    }
  }

  return [];
}
