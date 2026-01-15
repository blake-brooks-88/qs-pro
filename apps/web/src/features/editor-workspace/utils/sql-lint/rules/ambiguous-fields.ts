import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import type { SqlToken } from "../../sql-context";
import { createDiagnostic } from "../utils/helpers";
import { extractTableReferences } from "../../sql-context";
import { MC } from "@/constants/marketing-cloud";

const normalizeIdentifier = (value: string) => {
  return value
    .replace(/^\[|\]$/g, "")
    .trim()
    .toLowerCase();
};

const getSelectClauseTokens = (sql: string, tokens: SqlToken[]) => {
  const selectIndex = tokens.findIndex(
    (token) => token.type === "word" && token.value.toLowerCase() === "select",
  );
  if (selectIndex === -1) return [];
  const selectToken = tokens.at(selectIndex);
  if (!selectToken) return [];
  const fromIndex = tokens.findIndex(
    (token, index) =>
      index > selectIndex &&
      token.type === "word" &&
      token.value.toLowerCase() === "from" &&
      token.depth === selectToken.depth,
  );
  const endIndex = fromIndex === -1 ? tokens.length : fromIndex;
  return tokens.slice(selectIndex + 1, endIndex);
};

const getUnqualifiedFieldTokens = (sql: string, tokens: SqlToken[]) => {
  const selectClauseTokens = getSelectClauseTokens(sql, tokens);
  const candidates: { token: SqlToken; index: number }[] = [];

  selectClauseTokens.forEach((token, index) => {
    if (token.type !== "word" && token.type !== "bracket") return;
    const value = token.value.toLowerCase();
    if (value === "as" || value === "*" || value === "distinct") return;
    if (["select", "from", "where", "group", "order", "having"].includes(value))
      return;

    const prev = selectClauseTokens.at(index - 1);
    const next = selectClauseTokens.at(index + 1);
    if (prev?.type === "symbol" && prev.value === ".") return;
    if (next?.type === "symbol" && next.value === ".") return;
    if (prev?.type === "word" && prev.value.toLowerCase() === "as") return;
    if (next?.type === "symbol" && next.value === "(") return;

    candidates.push({ token, index });
  });

  return candidates.map((candidate) => candidate.token);
};

const getAmbiguousFieldDiagnostics = (
  sql: string,
  tokens: SqlToken[],
  dataExtensions: LintContext["dataExtensions"],
): SqlDiagnostic[] => {
  if (!dataExtensions || dataExtensions.length === 0) return [];

  const references = extractTableReferences(sql).filter(
    (reference) => !reference.isSubquery,
  );
  if (references.length < 2) return [];

  const referenceFields = references
    .map((reference) => {
      const dataExtension = dataExtensions.find((de) => {
        const name = normalizeIdentifier(de.name);
        const key = normalizeIdentifier(de.customerKey);
        const table = normalizeIdentifier(reference.name);
        return name === table || key === table;
      });
      return {
        reference,
        fields: new Set(
          dataExtension?.fields.map((field) =>
            normalizeIdentifier(field.name),
          ) ?? [],
        ),
      };
    })
    .filter((entry) => entry.fields.size > 0);

  if (referenceFields.length < 2) return [];

  const ambiguousFields = new Set<string>();
  const fieldTokens = getUnqualifiedFieldTokens(sql, tokens);
  for (const token of fieldTokens) {
    const fieldName = normalizeIdentifier(token.value);
    const matches = referenceFields.filter((entry) =>
      entry.fields.has(fieldName),
    );
    if (matches.length >= 2) {
      ambiguousFields.add(fieldName);
    }
  }

  if (ambiguousFields.size === 0) return [];

  return fieldTokens
    .filter((token) => ambiguousFields.has(normalizeIdentifier(token.value)))
    .map((token) =>
      createDiagnostic(
        `Field "${token.value}" exists in multiple tables — ${MC.SHORT} requires disambiguation. Add table aliases and prefix the field. Example: \`SELECT a.${token.value} FROM [Table1] a JOIN [Table2] b ON ...\`.`,
        "error",
        token.startIndex,
        token.endIndex,
      ),
    );
};

/**
 * Rule to detect ambiguous field names across multiple Data Extensions in JOINs.
 */
export const ambiguousFieldsRule: LintRule = {
  id: "ambiguous-fields",
  name: "Ambiguous Fields",
  check: (context: LintContext) => {
    return getAmbiguousFieldDiagnostics(
      context.sql,
      context.tokens,
      context.dataExtensions,
    );
  },
};
