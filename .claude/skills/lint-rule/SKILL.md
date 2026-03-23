---
name: lint-rule
description: Scaffold a new MCE SQL lint rule with rule file, test file, and registry wiring following QS Pro conventions. Use when adding a new SQL lint rule to the editor.
disable-model-invocation: true
---

# Lint Rule Scaffolder

Scaffolds a new MCE SQL lint rule in `apps/web/src/features/editor-workspace/utils/sql-lint/` following existing conventions.

## Prerequisites

Before creating ANY lint rule, verify the behavior is documented in the MCE SQL Reference:
`apps/web/src/features/editor-workspace/utils/sql-lint/MCE-SQL-REFERENCE.md`

If the behavior isn't documented there, ask the user whether to update the reference first.

## Steps

### 1. Gather Requirements

Ask the user (if not already specified):
- **What SQL pattern** should be detected? (e.g., "UNION without matching column counts")
- **Severity**: `error` (blocks execution), `warning` (advisory only), or `prereq` (incomplete query)?
- **Message**: What should the user see? Keep it actionable — explain the problem AND the fix.

### 2. Derive Naming

From the description, derive:
- **rule-id**: kebab-case identifier (e.g., `empty-in-clause`, `duplicate-table-alias`)
- **ruleName**: camelCase export name (e.g., `emptyInClauseRule`, `duplicateTableAliasRule`)
- **Rule Name**: Title Case for the `name` field (e.g., `Empty IN Clause`)

### 3. Create the Rule File

Create `apps/web/src/features/editor-workspace/utils/sql-lint/rules/{rule-id}.ts`.

**Pattern selection** — choose the right approach based on what the rule needs:

**A. Token-scanning rules** (most common — used by ~15 existing rules):
For rules that detect keyword patterns, missing clauses, or structural issues by scanning characters. These handle string literals, comments, and bracketed identifiers correctly.

```typescript
import type { LintContext, LintRule, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";

const get{PascalName}Diagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < sql.length) {
    const char = sql.charAt(index);
    const nextChar = sql.charAt(index + 1);

    // --- Skip string literals, comments, brackets ---
    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      index += 1;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && nextChar === "/") { inBlockComment = false; index += 2; continue; }
      index += 1;
      continue;
    }
    if (inSingleQuote) {
      if (char === "'") { if (nextChar === "'") { index += 2; continue; } inSingleQuote = false; }
      index += 1;
      continue;
    }
    if (inDoubleQuote) {
      if (char === '"') inDoubleQuote = false;
      index += 1;
      continue;
    }
    if (inBracket) {
      if (char === "]") inBracket = false;
      index += 1;
      continue;
    }
    if (char === "-" && nextChar === "-") { inLineComment = true; index += 2; continue; }
    if (char === "/" && nextChar === "*") { inBlockComment = true; index += 2; continue; }
    if (char === "'") { inSingleQuote = true; index += 1; continue; }
    if (char === '"') { inDoubleQuote = true; index += 1; continue; }
    if (char === "[") { inBracket = true; index += 1; continue; }

    // --- Rule-specific detection logic goes here ---
    // Use isWordChar() to match keywords
    // Use createDiagnostic() to emit diagnostics

    index += 1;
  }

  return diagnostics;
};

export const {camelName}Rule: LintRule = {
  id: "{rule-id}",
  name: "{Rule Name}",
  check: (context: LintContext) => get{PascalName}Diagnostics(context.sql),
};
```

**B. Token-array rules** (for rules that need the pre-tokenized token list):
For rules that need to analyze token sequences rather than raw characters. Use `context.tokens` from the `LintContext`.

```typescript
import type { LintContext, LintRule, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";

export const {camelName}Rule: LintRule = {
  id: "{rule-id}",
  name: "{Rule Name}",
  check: (context: LintContext) => {
    const diagnostics: SqlDiagnostic[] = [];
    const { sql, tokens } = context;
    // Analyze token sequence...
    return diagnostics;
  },
};
```

**C. Schema-aware rules** (for rules that need Data Extension metadata):
For rules that validate column references against known DE schemas. Use `context.dataExtensions`.

```typescript
import type { LintContext, LintRule, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";

export const {camelName}Rule: LintRule = {
  id: "{rule-id}",
  name: "{Rule Name}",
  check: (context: LintContext) => {
    const diagnostics: SqlDiagnostic[] = [];
    const { sql, dataExtensions } = context;
    if (!dataExtensions?.length) return diagnostics;
    // Validate against schema...
    return diagnostics;
  },
};
```

### 4. Create the Test File

Create `apps/web/src/features/editor-workspace/utils/sql-lint/rules/{rule-id}.test.ts`.

Every test file MUST have these three describe blocks:

```typescript
import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { {camelName}Rule } from "./{rule-id}";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("{camelName}Rule", () => {
  describe("violation detection", () => {
    it("should detect {the primary violation}", () => {
      const sql = "{violation SQL}";
      const diagnostics = {camelName}Rule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("{severity}");
      expect(diagnostics[0]?.message).toContain("{key phrase}");
    });

    // Add variations: multiple violations, different syntax forms, etc.
  });

  describe("valid SQL (should pass)", () => {
    it("should pass {normal valid case}", () => {
      const sql = "{valid SQL}";
      const diagnostics = {camelName}Rule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    // Add 2-3 valid SQL variations
  });

  describe("edge cases", () => {
    it("should not flag inside string literal", () => {
      const sql = "SELECT '{pattern that looks like violation}' FROM A";
      const diagnostics = {camelName}Rule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag inside line comment", () => {
      const sql = "SELECT * FROM A -- {pattern that looks like violation}";
      const diagnostics = {camelName}Rule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag inside block comment", () => {
      const sql = "SELECT * FROM A /* {pattern that looks like violation} */";
      const diagnostics = {camelName}Rule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });
});
```

### 5. Register the Rule

Edit `apps/web/src/features/editor-workspace/utils/sql-lint/index.ts`:

1. Add the import, grouped with similar rules (syntax errors, identifier errors, warning rules, etc.):
   ```typescript
   import { {camelName}Rule } from "./rules/{rule-id}";
   ```

2. Add to the `rules` array in the appropriate section:
   - **Error rules** that block execution: near other error rules
   - **Warning rules** that are advisory: at the end, with other warnings

### 6. Run Tests

```bash
pnpm --filter @qpp/web test -- rules/{rule-id}.test.ts
```

Verify all tests pass. Then run the full lint test suite to ensure no regressions:

```bash
pnpm --filter @qpp/web test -- sql-lint
```

### 7. Verify Against MCE Reference

Cross-check that the rule's behavior matches `MCE-SQL-REFERENCE.md`. If the rule covers a new restriction not yet documented, update the reference.

## Key Conventions

- **Severity matters**: `error` and `prereq` block query execution. `warning` never blocks. Choose carefully.
- **Accurate positions**: `startIndex` and `endIndex` must point to the actual problematic token/range — the Monaco editor uses these for red/yellow squiggly underlines.
- **String/comment awareness**: Token-scanning rules MUST skip string literals (`'...'`), double-quoted identifiers (`"..."`), bracketed identifiers (`[...]`), line comments (`--`), and block comments (`/* */`). Copy the skip pattern from the template above.
- **Escaped quotes**: Single quotes inside strings are escaped as `''` — the scanner handles this with the `nextChar === "'"` check.
- **Actionable messages**: Tell the user what's wrong AND how to fix it. Example: "LIMIT clause is not supported in MCE. Use TOP or OFFSET/FETCH instead."
- **`createDiagnostic()` helper**: Always use it — it's in `utils/helpers.ts`.
- **`isWordChar()` helper**: Use for keyword boundary detection to avoid partial matches (e.g., "IN" shouldn't match "INSERT").
