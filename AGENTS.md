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
- Code should be self-documenting. Comments should be minimal and only explain "why" not "what".
- TypeScript across apps/packages; use ESLint from `packages/eslint-config`.
- Key rules: no `console`, no `any`, unused args should be prefixed with `_`.
- API formatting uses Prettier (`apps/api` has a `format` script).
- Prefer configured path aliases (`@` imports) over deep relative paths.

## Testing Guidelines
- Vitest is used in `apps/api`, `apps/web`, and `packages/database`.
- API tests use `*.spec.ts`; e2e via `pnpm --filter api test:e2e`.
- `apps/worker` currently has no tests (script exits with error).

## Commit & Pull Request Guidelines
- Follow Conventional Commits with optional scopes, e.g. `feat(web): add auth UI` or `fix(auth): handle redirect`.
- PRs should include: a short summary, test notes (commands run), and linked issues.
- Include screenshots or recordings for UI changes in `apps/web`.
- absolutely no mention of phases, tasks, or specs or anything like it. Just what was done and why.

## Agent-Specific Instructions
- Use `agent-os/standards/` for detailed conventions.
- Ignore `agent-os/standards/backend-intent/` (legacy, conflicting guidance).
