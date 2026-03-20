# packages/schema-inferrer

SQL schema inference engine. Parses MCE SQL and infers field types from metadata and system data views.

## What This Package Provides

- `inferSchema()` — Infer output schema from SQL text + table metadata
- Function-to-type mappings for 100+ SQL functions
- Hard-coded MCE system data view definitions (Contact, Email, Automation, etc.)

## Gotchas

- **`node-sql-parser` is a peer dependency:** Not bundled. Consuming packages must install it.
- **T-SQL dialect only:** Parser is configured for MCE SQL. Standard SQL constructs may not parse correctly.
- **Dual output:** Built with tsup producing both ESM and CJS (`tsup src/index.ts --format esm,cjs`).
- **System data views are hard-coded:** Must be manually updated when MCE adds new system views.
- **Unknown functions return `"Unknown"` type:** Review inference results for unrecognized functions.
