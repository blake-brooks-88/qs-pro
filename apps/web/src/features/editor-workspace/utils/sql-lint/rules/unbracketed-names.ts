import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";
import { extractTableReferences } from "../../sql-context";

const getUnbracketedSpaceWarnings = (
  sql: string,
  dataExtensions: LintContext["dataExtensions"],
): SqlDiagnostic[] => {
  if (!dataExtensions || dataExtensions.length === 0) return [];
  const spaceNames = new Set(
    dataExtensions
      .map((de) => de.name.trim())
      .filter((name) => name.includes(" ") || name.includes("-"))
      .map((name) => name.toLowerCase()),
  );

  if (spaceNames.size === 0) return [];

  return extractTableReferences(sql)
    .filter((reference) => !reference.isSubquery)
    .filter((reference) => !reference.isBracketed)
    .map((reference) => {
      const candidate = reference.alias
        ? `${reference.name} ${reference.alias}`
        : reference.name;
      return {
        reference,
        candidate: candidate.toLowerCase(),
      };
    })
    .filter(({ candidate }) => spaceNames.has(candidate))
    .map(({ reference }) =>
      createDiagnostic(
        "Data Extension names with spaces or hyphens must be wrapped in brackets. Example: `FROM [My Data Extension]` or `FROM [My-Data-Extension]`.",
        "warning",
        reference.startIndex,
        reference.endIndex,
      ),
    );
};

/**
 * Rule to detect Data Extension names with spaces that are not bracketed.
 */
export const unbracketedNamesRule: LintRule = {
  id: "unbracketed-names",
  name: "Unbracketed Names with Spaces",
  check: (context: LintContext) => {
    return getUnbracketedSpaceWarnings(context.sql, context.dataExtensions);
  },
};
