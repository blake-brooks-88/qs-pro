import type {
  DataExtension,
  DataExtensionField,
} from "@/features/editor-workspace/types";
import type { SqlTableReference } from "./sql-context";
import { MAX_SUGGESTIONS } from "@/features/editor-workspace/constants";

export interface DataExtensionSuggestion {
  label: string;
  insertText: string;
  customerKey: string;
  name: string;
  isShared: boolean;
}

export interface FieldSuggestion {
  label: string;
  insertText: string;
  detail?: string;
}

const normalize = (value: string) => value.trim().toLowerCase();

export const fuzzyMatch = (term: string, candidate: string) => {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return true;
  const normalizedCandidate = normalize(candidate);
  let termIndex = 0;

  for (let i = 0; i < normalizedCandidate.length; i += 1) {
    if (normalizedCandidate.charAt(i) === normalizedTerm.charAt(termIndex)) {
      termIndex += 1;
      if (termIndex >= normalizedTerm.length) return true;
    }
  }

  return false;
};

/**
 * Scores a suggestion for sorting based on match quality.
 * Higher scores indicate better matches.
 */
const scoreSuggestion = (term: string, suggestion: string): number => {
  const normalizedTerm = normalize(term);
  const normalizedSuggestion = normalize(suggestion);

  // Empty term - return neutral score so alphabetical sort takes over
  if (!normalizedTerm) {
    return 0;
  }

  // Exact prefix match - highest priority
  // Shorter matches rank higher within this tier
  if (normalizedSuggestion.startsWith(normalizedTerm)) {
    return 1000 - normalizedSuggestion.length;
  }

  // CamelCase or underscore boundary match
  // Split on capital letters or underscores
  const boundaries = suggestion
    .split(/(?=[A-Z])|_/)
    .map((s) => s.toLowerCase());
  if (boundaries.some((b) => b.startsWith(normalizedTerm))) {
    return 500;
  }

  // Contains match
  if (normalizedSuggestion.includes(normalizedTerm)) {
    return 100;
  }

  // Fuzzy match (non-contiguous characters)
  return 50;
};

const toBracketed = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed;
  return `[${trimmed}]`;
};

export const buildDataExtensionSuggestions = (
  dataExtensions: DataExtension[],
  sharedFolderIds: Set<string>,
  searchTerm: string,
  maxSuggestions: number = MAX_SUGGESTIONS,
): DataExtensionSuggestion[] => {
  const normalizedTerm = normalize(searchTerm.replace(/^ent\./i, ""));

  return dataExtensions
    .filter((de) => {
      const name = de.name ?? "";
      const key = de.customerKey ?? "";
      return (
        fuzzyMatch(normalizedTerm, name) || fuzzyMatch(normalizedTerm, key)
      );
    })
    .sort((a, b) => {
      // Sort by score (higher is better), then alphabetically
      const scoreA = scoreSuggestion(normalizedTerm, a.name);
      const scoreB = scoreSuggestion(normalizedTerm, b.name);
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Higher scores first
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    })
    .slice(0, maxSuggestions) // Enforce maximum suggestions limit
    .map((de) => {
      const isShared = sharedFolderIds.has(de.folderId);
      const bracketedName = toBracketed(de.name);
      const label = isShared ? `ENT.${bracketedName}` : bracketedName;
      const insertText = isShared ? `ENT.${bracketedName}` : bracketedName;
      return {
        label,
        insertText,
        customerKey: de.customerKey,
        name: de.name,
        isShared,
      };
    });
};

const formatFieldType = (field: DataExtensionField) => {
  if (typeof field.length === "number") {
    return `${field.type}(${field.length})`;
  }
  return field.type;
};

export const buildFieldSuggestions = (
  fields: DataExtensionField[],
  options: { prefix?: string; ownerLabel?: string } = {},
): FieldSuggestion[] => {
  const { prefix, ownerLabel } = options;
  return fields
    .map((field) => {
      const baseName = field.name.includes(" ")
        ? toBracketed(field.name)
        : field.name;
      const insertText = prefix ? `${prefix}.${baseName}` : baseName;
      return {
        label: `${field.name} - ${formatFieldType(field)}`,
        insertText,
        detail: ownerLabel ? `Field • ${ownerLabel}` : "Field",
      };
    })
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
};

export const resolveTableForAlias = (
  alias: string,
  tables: SqlTableReference[],
) => {
  const normalized = normalize(alias);
  return tables.find((table) => table.alias?.toLowerCase() === normalized);
};

export const getPrimaryTable = (tables: SqlTableReference[]) => {
  if (tables.length === 0) return null;
  const direct = tables.find((table) => !table.isSubquery);
  return direct ?? tables.at(0) ?? null;
};
