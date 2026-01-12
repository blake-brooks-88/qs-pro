/**
 * Generates a smart alias for a SQL table name.
 *
 * Strategy:
 * 1. Extract initials from CamelCase, PascalCase, underscore, or space-separated words
 * 2. If initials collide with existing aliases, use first 4 chars (abbreviated)
 * 3. If still collides, append incrementing number
 */
export function generateSmartAlias(
  tableName: string,
  existingAliases: Set<string>,
): string {
  // Strip brackets if present
  const clean = tableName.replace(/^\[|\]$/g, "").trim();

  // Extract words from various formats
  const words = clean.split(/(?=[A-Z])|[\s_-]+/).filter((w) => w.length > 0);

  // Generate initials
  const initials = words.map((w) => w[0]?.toLowerCase() || "").join("");

  // Try initials first
  if (initials && !existingAliases.has(initials)) {
    return initials;
  }

  // Try abbreviated (first 4 chars)
  const abbreviated = clean.slice(0, 4).toLowerCase();
  if (!existingAliases.has(abbreviated)) {
    return abbreviated;
  }

  // Append number
  const base = initials || clean[0]?.toLowerCase() || "t";
  let counter = 2;
  while (existingAliases.has(`${base}${counter}`)) {
    counter++;
  }
  return `${base}${counter}`;
}
