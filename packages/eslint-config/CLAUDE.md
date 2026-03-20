# packages/eslint-config

Centralized ESLint flat config for the monorepo.

## What It Enforces

- **TypeScript:** No `any`, unused vars must be prefixed with `_`
- **Security:** SSRF and object injection warnings
- **Code quality:** No `console` (except warn/error), const preference, strict equality
- **Imports:** Auto-sorted by `simple-import-sort`
- **Formatting:** Prettier as an ESLint error (not warning)
- **Vitest:** No focused tests, expect-expect, no identical titles

## Gotchas

- **Flat config format:** Uses ESLint's new flat config — `.eslintrc.json` files are ignored.
- **Test file exceptions:** Empty catches and throw literals are allowed in `*.test.*` and `*.spec.*` files.
- **Type-aware rules not configured here:** Individual packages configure `projectService` for type-aware rules in their own ESLint config.
