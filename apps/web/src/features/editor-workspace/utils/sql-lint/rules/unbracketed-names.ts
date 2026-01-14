import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";
import { extractFromJoinTargets } from "../utils/extract-from-join-targets";

/**
 * Normalize a DE name for comparison:
 * - trim whitespace
 * - lowercase
 * - collapse internal whitespace to single spaces
 */
const normalizeName = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Build a lookup map of known DE names from metadata.
 * Keys are normalized names, values are the original exact names.
 */
const buildKnownDELookup = (
  dataExtensions: LintContext["dataExtensions"],
): Map<string, string> => {
  const lookup = new Map<string, string>();
  if (!dataExtensions) return lookup;

  for (const de of dataExtensions) {
    // Add normalized name
    const normalizedName = normalizeName(de.name);
    if (!lookup.has(normalizedName)) {
      lookup.set(normalizedName, de.name);
    }

    // Add normalized customerKey
    const normalizedKey = normalizeName(de.customerKey);
    if (normalizedKey && !lookup.has(normalizedKey)) {
      lookup.set(normalizedKey, de.name);
    }
  }

  return lookup;
};

/**
 * Create an actionable error message for unbracketed DE names.
 */
const createBracketGuidanceMessage = (
  rawText: string,
  hasEntPrefix: boolean,
  exactMetadataName?: string,
): string => {
  // Clean up the raw text for display
  const cleanedName = rawText.replace(/\s+/g, " ").trim();

  // Handle ENT. prefix
  if (hasEntPrefix) {
    // Extract the portion after ENT.
    const afterEnt = cleanedName.replace(/^ENT\.\s*/i, "");
    const bracketedName = exactMetadataName || afterEnt;
    return `Data Extension names with spaces must be wrapped in brackets. Use: FROM ENT.[${bracketedName}]`;
  }

  const bracketedName = exactMetadataName || cleanedName;
  return `Data Extension names with spaces must be wrapped in brackets. Use: FROM [${bracketedName}]`;
};

/**
 * Detect unbracketed Data Extension names that need brackets.
 *
 * High-confidence detection (no metadata needed):
 * - 3+ word identifier runs (e.g., "My Data Extension")
 * - Any identifier with hyphens (e.g., "My-Data-Extension")
 *
 * Metadata-driven detection:
 * - 2-word runs that match a known DE name/customerKey
 */
const getUnbracketedNameErrors = (
  sql: string,
  dataExtensions: LintContext["dataExtensions"],
): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  const targets = extractFromJoinTargets(sql);
  const knownDEs = buildKnownDELookup(dataExtensions);

  for (const target of targets) {
    // Skip subqueries and already-bracketed names
    if (target.isSubquery || target.isBracketed) continue;

    // Skip dot-qualified names UNLESS they have ENT. prefix
    // (e.g., skip dbo.Table but process ENT.My Data Extension)
    if (target.hasDot && !target.hasEntPrefix) continue;

    // High-confidence: 3+ words with spaces (not purely hyphenated)
    const hasSpaces = target.rawText.includes(" ");
    if (target.wordCount >= 3 && hasSpaces) {
      diagnostics.push(
        createDiagnostic(
          createBracketGuidanceMessage(
            target.rawText,
            target.hasEntPrefix,
            // Check if there's a metadata match for better suggestion
            knownDEs.get(normalizeName(target.rawText)),
          ),
          "error",
          target.startIndex,
          target.endIndex,
        ),
      );
      continue;
    }

    // Metadata-driven: 2-word runs that match known DE
    if (target.wordCount === 2) {
      const normalizedRaw = normalizeName(target.rawText);
      const exactName = knownDEs.get(normalizedRaw);

      if (exactName) {
        diagnostics.push(
          createDiagnostic(
            createBracketGuidanceMessage(
              target.rawText,
              target.hasEntPrefix,
              exactName,
            ),
            "error",
            target.startIndex,
            target.endIndex,
          ),
        );
      }
    }
  }

  return diagnostics;
};

/**
 * Rule to detect Data Extension names that need brackets.
 *
 * Detects:
 * - Multi-word names (3+ words) that aren't bracketed
 * - Names with hyphens that aren't bracketed
 * - 2-word names that match known DE metadata
 */
export const unbracketedNamesRule: LintRule = {
  id: "unbracketed-names",
  name: "Unbracketed Data Extension Names",
  check: (context: LintContext) => {
    return getUnbracketedNameErrors(context.sql, context.dataExtensions);
  },
};
