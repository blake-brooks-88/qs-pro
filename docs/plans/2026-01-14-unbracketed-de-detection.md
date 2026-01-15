# Unbracketed Data Extension Name Detection

## Goal

Detect unbracketed Data Extension names containing spaces/hyphens (e.g. `FROM My Data Extension`) and return an actionable diagnostic like "Wrap the name in brackets: `FROM [My Data Extension]`", instead of (or at least before) a generic parse error.

---

## 0) Pre-work: confirm current behavior + constraints

1. Read the rule and confirm the blind spot:
    - `apps/web/src/features/editor-workspace/utils/sql-lint/rules/unbracketed-names.ts`
    - Confirm it relies on `extractTableReferences()` which only captures a single token as the table name.
2. Read table reference extraction to confirm why multi-word names are lost:
    - `apps/web/src/features/editor-workspace/utils/sql-context.ts:381`
    - Confirm `extractTableReferences()` grabs only `nextToken` (or `ENT.<token>`) as `reference.name`.
3. Confirm where diagnostics are used for execution blocking and what severities matter:
    - `apps/web/src/features/editor-workspace/utils/sql-lint/types.ts` (blocking is `error` + `prereq` only)
    - `apps/web/src/features/editor-workspace/components/EditorWorkspace.tsx:116-129` (first blocking diagnostic is shown)
4. Confirm worker parse error behavior and where to add parse-failure recovery:
    - `apps/web/src/features/editor-workspace/utils/sql-lint/parser/ast-parser.ts:112` (parse failure → generic error today)
    - Note existing precedent for "parse failed → token fallback → return better diagnostics":
        - `apps/web/src/features/editor-workspace/utils/sql-lint/parser/policy.ts:415` (`checkUnsupportedFunctionsViaTokens`)

**Acceptance for 0)**

- You can state (with file references above) exactly why `FROM My Data Extension` currently becomes a generic parse error and why `unbracketed-names` doesn't catch it.

---

## 1) Define the exact detection requirements (no ambiguity)

Implement detection for these scenarios:

### 1A) High-confidence (should produce `severity: "error"`)

- After `FROM` or `JOIN`, the user has an unbracketed identifier run that clearly requires brackets:
    - **Case A**: 3+ identifier "words" in a row at the same paren depth (e.g. `My Data Extension`)
    - **Case B**: any identifier run containing an unbracketed hyphen between identifier words (e.g. `My-Data-Extension` without `[]`)
- The run is **not**:
    - A subquery target (`FROM (…)`)
    - Already bracketed (`FROM [My Data Extension]`)
    - Dot-qualified (contains `.` like `dbo.Table` or `ENT.Table`) unless it's `ENT.<multiword>` (handled explicitly below)

### 1B) Metadata-driven (should produce `severity: "error"`)

- If `dataExtensions` is available, also detect 2-word DE names that would otherwise look like table + alias:
    - Example: DE name is `My Data` and user typed `FROM My Data` (parser will treat `Data` as alias, but it's wrong)
- Matching must check both:
    - `DataExtension.name`
    - `DataExtension.customerKey`
    - From `apps/web/src/features/editor-workspace/types.ts:35-42`

### 1C) Message requirements (must be actionable)

- Always include a concrete fix snippet:
    - Generic: `Wrap the Data Extension name in brackets: FROM [My Data Extension]`
    - If `ENT.` prefix is present: `FROM ENT.[My Data Extension]`
- If metadata match exists, optionally add: `Did you mean [Exact Name]?` (exact casing from metadata).

**Acceptance for 1)**

- A written list of the exact patterns and exclusions above is agreed and implemented as-is (no "we'll see" decisions later).

---

## 2) Add a shared "FROM/JOIN target run" extractor (token-based)

Create a helper that works even when the SQL is syntactically invalid.

1. Add new utility file:
    - `apps/web/src/features/editor-workspace/utils/sql-lint/utils/extract-from-join-targets.ts` (or equivalent under `sql-lint/utils/`)
2. The helper must:
    - Tokenize using the existing tokenizer (do not write a new one):
        - Import `tokenizeSql` from `apps/web/src/features/editor-workspace/utils/sql-lint/utils/tokenizer.ts`
    - Walk tokens and, for each `FROM`/`JOIN` token, collect the immediate target run:
        - If next non-comma token is `(`, mark as subquery and skip.
        - If next token is bracket, mark `isBracketed: true` and capture that single token span.
        - Otherwise, collect a span consisting of:
            - identifier tokens: word tokens
            - allowed connector symbols only when between identifier tokens: `.` and `-`
        - Stop collection when encountering, at the same depth:
            - clause boundaries: `ON`, `WHERE`, `GROUP`, `ORDER`, `HAVING`, `UNION`, `EXCEPT`, `INTERSECT`
            - join boundaries: `JOIN`, `INNER`, `LEFT`, `RIGHT`, `FULL`, `CROSS`
            - comma `,`
3. The helper must return for each target:
    - `keyword`: `"from"` | `"join"`
    - `startIndex`, `endIndex` (character offsets into the SQL string)
    - `rawText` = exact `sql.slice(startIndex, endIndex)`
    - `wordCount` (count only word tokens in the run, excluding `ENT` if it's part of `ENT.` prefix)
    - `hasHyphen`, `hasDot`
    - `hasEntPrefix` (true if run begins with `ENT.`)
    - `isBracketed`, `isSubquery`

**Return type interface:**

```typescript
interface FromJoinTarget {
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
```

**Acceptance for 2)**

- Given input SQL, the helper deterministically returns the correct span for:
    - `FROM My Data Extension`
    - `FROM My-Data-Extension`
    - `FROM dbo.Table`
    - `FROM ENT.Table`
    - `FROM ENT.My Data Extension` (captures `ENT.` prefix + multiword portion)
    - `FROM (SELECT ...) sub`

---

## 3) Upgrade the sync lint rule to use the new extractor (immediate UX)

Modify:

- `apps/web/src/features/editor-workspace/utils/sql-lint/rules/unbracketed-names.ts`

**Important**: The existing `extractTableReferences()` function is used by other code in the codebase. The new extractor is an **addition**, not a replacement.

Steps:

1. Replace `extractTableReferences(sql)` usage **in this rule only** with the new extractor from Task 2.
2. Build a normalized lookup of known DE names when `context.dataExtensions` is present:
    - Normalize by: trim, lowercase, collapse internal whitespace to single spaces.
    - Include entries for:
        - `de.name`
        - `de.customerKey`
3. For each extracted FROM/JOIN target:
    - Skip if `isSubquery` or `isBracketed`.
    - If `hasDot` and NOT `hasEntPrefix`, skip (dot-qualified names are out of scope).
    - If `wordCount >= 3` OR `hasHyphen`:
        - Emit `severity: "error"` (**note: upgrading from current "warning"**)
        - Range: target `startIndex..endIndex`
        - Message: include `FROM [${cleanedRawText}]` (and `ENT.` if present).
    - Else if `wordCount === 2`:
        - Only emit an error if the 2-word normalized `rawText` matches a known DE name/customerKey.
        - If matched, message should include the exact bracketed name from metadata: `FROM [Exact Metadata Name]`
4. Ensure the rule still returns `[]` when the SQL is empty or irrelevant (no FROM/JOIN present).

**Acceptance for 3)**

- With `dataExtensions` provided, `lintSql()` returns a single error diagnostic for:
    - `SELECT * FROM My Data Extension`
    - `SELECT * FROM My Data` (only when `My Data` exists in metadata)
- With no metadata, `lintSql()` returns an error for 3+ word / hyphen cases, and returns nothing for `FROM TableA alias`.

---

## 4) Add worker-side parse-failure recovery (best-effort even without metadata)

Modify:

- `apps/web/src/features/editor-workspace/utils/sql-lint/parser/ast-parser.ts:112`

Steps:

1. Add a new token-based fallback function in the parser layer (parallel to unsupported-functions fallback):
    - New file: `apps/web/src/features/editor-workspace/utils/sql-lint/parser/unbracketed-de-recovery.ts`
    - It must:
        - Accept `(sql: string, errorOffset: number | undefined)`
        - Use the extractor from Task 2 (import it into the worker-safe path)
        - Find the nearest FROM/JOIN target whose span contains `errorOffset` OR where `errorOffset` is within N chars after the span end (set N=2 to cover "unexpected token right after")
        - Only return a diagnostic if:
            - target is unbracketed, not subquery, not dot-qualified (except `ENT.<multiword>`), and (`wordCount >= 3` or `hasHyphen`)
2. In `parseAndLint()` after unsupported-function fallback and before returning the generic parse error:
    - Call this new recovery function.
    - If it returns diagnostics, return them instead of the generic parse error.

**Acceptance for 4)**

- `parseAndLint("SELECT * FROM My Data Extension")` returns an error with the bracket guidance message (not "Unexpected …").
- `parseAndLint("SELECT * FROM TableA a")` does not return this bracket guidance error.

---

## 5) Ensure merged diagnostics behave predictably (no UX regressions)

Review and, if necessary, update merge behavior in:

- `apps/web/src/features/editor-workspace/utils/sql-lint/use-sql-diagnostics.ts:233-259` (the `mergeDiagnostics` function)

Concrete requirements:

1. The first blocking diagnostic shown in `EditorWorkspace` should be the bracket guidance error (because it starts at the DE run, earlier than the parser's unexpected token).
2. Do not suppress unrelated worker errors.

**Note on current implementation**: The existing merge logic (lines 233-259) filters worker errors by message content. The new bracket guidance errors should automatically pass through since they won't contain suppression patterns like "MCE", "not available", "not supported", or "read-only". Verify this is the case.

If you need to change anything:

- Only change sorting/dedupe if the new errors aren't being prioritized.
- Do not introduce new diagnostic fields (current type has only `message`/`severity`/`startIndex`/`endIndex`).

**Acceptance for 5)**

- In UI flow, execution gating displays the bracket guidance message for this mistake.

---

## 6) Add targeted tests (sync + worker)

Add/modify tests only where the repo already has coverage for these areas:

### 6A) Sync rule tests

1. Create a **new** test file:
    - `apps/web/src/features/editor-workspace/utils/sql-lint/rules/unbracketed-names.test.ts`
2. Test cases:
    - With metadata containing `My Data Extension`:
        - SQL: `SELECT * FROM My Data Extension`
        - Expect: 1 diagnostic, `severity === "error"`, message contains `FROM [My Data Extension]`
    - With metadata containing `My Data`:
        - SQL: `SELECT * FROM My Data`
        - Expect: 1 diagnostic error suggesting `[My Data]`
    - No metadata:
        - SQL: `SELECT * FROM My Data Extension`
        - Expect: 1 diagnostic error (generic bracket guidance)
    - No metadata:
        - SQL: `SELECT * FROM Contacts c`
        - Expect: 0 diagnostics
    - Dot-qualified:
        - SQL: `SELECT * FROM dbo.Table`
        - Expect: 0 diagnostics

### 6B) Worker parser tests

Modify:

- `apps/web/src/features/editor-workspace/utils/sql-lint/parser/ast-parser.test.ts`

Add test cases:

- `parseAndLint("SELECT * FROM My Data Extension")` returns 1 error whose message references brackets.
- Ensure a different syntax error still returns a generic parse error (e.g. `SELECT , FROM Contacts`), proving you didn't over-suppress.

**Acceptance for 6)**

- Tests cover: 2-word metadata match, 3+ word heuristic, alias non-trigger, dot-qualified non-trigger, and worker recovery path.

---

## 7) Manual verification checklist (exact editor scenarios)

Run locally and confirm in Monaco:

1. Type: `SELECT * FROM My Data Extension`
    - See red squiggle on `My Data Extension`
    - Tooltip/run-block message shows bracket guidance
2. Type: `SELECT * FROM Contacts c`
    - No bracket warning/error
3. Type: `SELECT * FROM dbo.Table`
    - No bracket warning/error
4. Type: `SELECT * FROM ENT.My Data Extension`
    - Error suggests `ENT.[My Data Extension]` (or equivalent agreed format)

**Acceptance for 7)**

- The original "cryptic parse failure" scenario is replaced by an actionable message in the UI.
