# Repository Guidelines

## Project Structure & Module Organization
- `apps/api`: NestJS + Fastify API (auth, metadata proxy, sessions).
- `apps/web`: Vite + React frontend.
- `apps/worker`: Node.js + BullMQ worker.
- `packages/database`: Drizzle ORM schema and migrations.
- `packages/shared-types`: Zod schemas and shared TypeScript types.
- `packages/eslint-config`: shared linting rules.
- `docker-compose.yml`: local PostgreSQL + Redis.
- `agent-os/standards`: team conventions; see Agent-Specific Instructions.

## Build, Test, and Development Commands
- `pnpm install`: install workspace dependencies.
- `docker-compose up -d`: start PostgreSQL + Redis for local dev.
- `pnpm dev`: run API + web concurrently (root script).
- `pnpm -r build`: build all packages.
- `pnpm -r lint` / `pnpm -r typecheck` / `pnpm -r test`: run workspace-wide checks.
- `pnpm --filter api start:dev`: API in watch mode.
- `pnpm --filter @qs-pro/web dev`: web dev server.
- `pnpm --filter worker start`: run the worker.
- `pnpm db:generate` / `pnpm db:migrate`: generate/migrate DB schema via `packages/database`.

## Coding Style & Naming Conventions
- TypeScript across apps/packages; use ESLint from `packages/eslint-config`.
- Key rules: no `any`, unused args prefixed with `_`, console limited to `warn`/`error` only.
- API formatting uses Prettier (`apps/api` has a `format` script).
- Prefer configured path aliases (`@` imports) over deep relative paths.

## Comments Policy
Comments are the **exception**, not the rule. Code should be self-documenting.

**Acceptable comments:**
- Explaining *why* behind a non-obvious decision or exception
- JSDoc for public APIs that external consumers will use

**Unacceptable comments:**
- "Fix for X" or changelog-style notes (that's what git history is for)
- Describing what the code does (the code shows that)
- Commented-out code (delete it; git has history)

## Testing Guidelines
- Vitest is used in `apps/api`, `apps/web`, and `packages/database`.
- API tests use `*.spec.ts`; e2e via `pnpm --filter api test:e2e`.
- `apps/worker` currently has no tests (script exits with error).

## Commit & Pull Request Guidelines
- Follow Conventional Commits with optional scopes, e.g. `feat(web): add auth UI` or `fix(auth): handle redirect`.
- PRs should include: a short summary, test notes (commands run), and linked issues.
- Include screenshots or recordings for UI changes in `apps/web`.
- absolutely no mention of phases, tasks, or specs or anything like it IN COMMIT MESSAGES. Just what was done and why.

## Agent-Specific Instructions
- Use `agent-os/standards/` for detailed conventions.
- Ignore `agent-os/standards/backend-intent/` (legacy, conflicting guidance).

## MCE SQL Reference

**CRITICAL:** When working on SQL editor features (linting, autocomplete, syntax highlighting, validation), you MUST follow the MCE SQL Reference:

`apps/web/src/features/editor-workspace/utils/sql-lint/MCE-SQL-REFERENCE.md`

This document is the authoritative source for:
- Supported SQL operations in Marketing Cloud Engagement
- Prohibited keywords and statements (INSERT, UPDATE, DELETE, etc.)
- Supported and unsupported functions
- Best practice warnings
- Current lint rules and their behavior

All lint rules, autocomplete suggestions, and editor validations MUST align with this reference. Do not introduce SQL features that are not documented as supported in MCE.
