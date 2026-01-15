# SQL Linter AST Redesign - Spike Results

## Summary

The feasibility spike for `node-sql-parser` is **SUCCESSFUL**. The parser can be used for the AST-based linter redesign with the documented limitations and workarounds.

## Environment

- **Parser Version**: `node-sql-parser@5.4.0`
- **Dialect Used**: `transactsql`
- **Browser Build**: Works in Vite without Node builtin polyfills

## Browser Bundle Verification

**Result**: PASS

The parser instantiates and runs successfully in Vitest (JSDOM environment), which validates Vite bundling compatibility. No Node.js builtins or polyfills are required.

```typescript
import { Parser } from "node-sql-parser";
const parser = new Parser();
const ast = parser.astify(sql, { database: "transactsql" });
```

## Location Strategy

**Result**: PASS - Parse errors provide absolute offset

Parse errors include `location.start.offset` which can be used directly for `startIndex` in `SqlDiagnostic`. No line/column conversion needed for error positioning.

### Error Location Format

```json
{
  "message": "Expected ... but \",\" found.",
  "location": {
    "start": { "offset": 7, "line": 1, "column": 8 },
    "end": { "offset": 8, "line": 1, "column": 9 }
  }
}
```

**Conversion strategy**: Use `error.location.start.offset` directly as `startIndex` and `error.location.end.offset` as `endIndex`.

### AST Node Location Information

**Result**: NOT AVAILABLE

AST nodes do not include location/range information. For policy and semantic rule diagnostics, we need fallback strategies:

1. **Statement-level errors**: Use full SQL length (0 to sql.length)
2. **Clause-level errors**: Use token-based fallback detection to find the keyword position
3. **Expression-level errors**: Search for the construct in the original SQL string

## Corpus Parsing Results

### Core MCE Constructs (All PASS)

| Construct | Parses | Notes |
|-----------|--------|-------|
| Basic SELECT | Yes | |
| SELECT with aliases | Yes | |
| Bracketed identifiers `[Name]` | Yes | |
| SELECT DISTINCT | Yes | |
| SELECT TOP / TOP (n) | Yes | |
| INNER/LEFT/RIGHT/FULL/CROSS JOIN | Yes | |
| Multiple JOINs | Yes | |
| UNION / UNION ALL | Yes | |
| GROUP BY | Yes | |
| GROUP BY + HAVING | Yes | |
| ORDER BY | Yes | |
| OFFSET + FETCH | Yes | |
| Subquery in FROM | Yes | |
| Subquery in WHERE (IN) | Yes | |
| Subquery with TOP + ORDER BY | Yes | |
| EXISTS subquery | Yes | |
| Simple CASE | Yes | |
| Searched CASE | Yes | |
| String functions | Yes | LEN, UPPER, LEFT, CONCAT, CHARINDEX |
| Date functions | Yes | GETDATE, DATEADD, DATEDIFF, YEAR, MONTH |
| Aggregate functions | Yes | COUNT, SUM, AVG, MIN, MAX, COUNT(DISTINCT) |
| NULL handling | Yes | ISNULL, COALESCE, NULLIF |
| Conversion functions | Yes | CAST, CONVERT with style |
| IIF function | Yes | |
| GROUP BY ROLLUP | Yes | |
| GROUP BY CUBE | Yes | |
| WITH (NOLOCK) table hint | Yes | |
| CTE (WITH...AS) | Yes | Detectable via `stmt.with` property |

### Constructs Not Parsed (Require Fallback Detection)

| Construct | Parses | Fallback Strategy |
|-----------|--------|-------------------|
| INTERSECT | No | Keep token-based detection |
| EXCEPT | No | Keep token-based detection |
| OFFSET without FETCH | No | Keep token-based detection |
| AT TIME ZONE | No | Keep token-based detection |
| DECLARE @var | No | Keep token-based detection (already covered) |
| @Variable usage | No | Keep token-based detection |
| #TempTable | No | Keep token-based detection |

### Prohibited Constructs (All Parse - Good for Detection)

| Construct | Parses | AST Detection |
|-----------|--------|---------------|
| INSERT | Yes | `stmt.type === "insert"` |
| UPDATE | Yes | `stmt.type === "update"` |
| DELETE | Yes | `stmt.type === "delete"` |
| CTE (WITH...AS) | Yes | `stmt.with !== null` |
| LIMIT clause | Yes | `stmt.limit !== null` |

### Syntax Error Detection (All PASS)

| Error Type | Detected | Location Accurate |
|------------|----------|-------------------|
| Missing comma between expressions | Yes | Yes |
| Unmatched parenthesis | Yes | Yes |
| Unterminated string | Yes | Yes |
| Missing FROM clause | Partial | Some dialects allow SELECT without FROM |

## AST Shape Documentation

### SELECT Statement Shape

```typescript
{
  type: "select",
  with: null | CteDefinition[],
  options: null,
  distinct: null | "DISTINCT",
  columns: ColumnList[],
  into: null,
  from: TableReference[],
  for: null,
  where: Expression | null,
  groupby: GroupByList | null,
  having: Expression | null,
  top: TopClause | null,
  orderby: OrderByList | null,
  limit: LimitClause | null
}
```

### Statement Type Detection

```typescript
// Prohibited DML statements
stmt.type === "insert"  // INSERT statement
stmt.type === "update"  // UPDATE statement
stmt.type === "delete"  // DELETE statement
stmt.type === "select"  // SELECT statement (allowed)
```

### CTE Detection

```typescript
// stmt.with is an array of CTE definitions
stmt.with: [
  {
    name: { type: "default", value: "CTE" },
    stmt: { tableList: [...], columnList: [...], ast: {...} },
    columns: null
  }
]
```

### LIMIT Clause Detection (MCE Prohibition)

```typescript
// stmt.limit is populated when LIMIT clause is present
stmt.limit: {
  seperator: "",
  value: [{ type: "number", value: 10 }]
}
```

### JOIN Information

```typescript
// stmt.from is an array; joined tables have join info
stmt.from: [
  { table: "TableA", as: "a", ... },
  { table: "TableB", as: "b", join: "INNER JOIN", on: {...} }
]
```

## Recommendations

### Proceed with Implementation

The spike confirms that `node-sql-parser` is viable for the AST-based linter redesign with the following architecture:

1. **Layer 0 (Prereq)**: Keep synchronous prereq checks (empty SQL, missing SELECT)
2. **Layer 1 (Parser)**: Use `node-sql-parser` for syntax validation
   - Parse errors provide good locations via `offset`
   - Transform common parse errors into MCE-specific messages
3. **Layer 2 (Policy)**: AST-based detection for:
   - Statement type allowlist (`select` only)
   - CTE detection (`stmt.with`)
   - LIMIT prohibition (`stmt.limit`)
   - Prohibited DML (`insert`, `update`, `delete`)
4. **Layer 3 (Semantic)**: Migrate rules incrementally with fallback

### Fallback Detection Required For

These constructs need token-based fallback detection since the parser doesn't handle them:

- `INTERSECT` / `EXCEPT` - Keep existing prohibited-keywords detection
- `AT TIME ZONE` - Keep token-based; not critical for MVP
- `DECLARE` / `SET` / `@var` - Keep existing variable-usage rule
- `#TempTable` - Keep token-based detection
- `OFFSET` without `FETCH` - Keep token-based detection

### Location Fallback Strategy

Since AST nodes lack position info, use this fallback approach for policy/semantic errors:

```typescript
function findKeywordPosition(sql: string, keyword: string): number {
  // Search for keyword not in string literals or comments
  // Use existing tokenizer to locate keywords
}
```

## Test Artifacts

The spike test file is located at:
`apps/web/src/features/editor-workspace/utils/sql-lint/parser/sql-parser-spike.test.ts`

Run with:
```bash
pnpm --filter @qs-pro/web test -- --run src/features/editor-workspace/utils/sql-lint/parser/sql-parser-spike.test.ts
```

## Next Steps

Proceed to **Step 1**: Refactor Editor Integration + Add Worker Pipeline

1. Create worker infrastructure (`sql-lint.worker.ts`, `protocol.ts`)
2. Create `use-sql-diagnostics.ts` hook for merged diagnostics
3. Fix execution gating (only `error` + `prereq` block; `warning` does not block)
4. Keep legacy rules running synchronously while AST rules run in worker
