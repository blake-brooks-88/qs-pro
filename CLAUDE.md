# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QS Pro (Query++) is an ISV-grade SQL IDE for Salesforce Marketing Cloud Engagement (MCE). It provides a "Zen Mode" interface, intelligent autocomplete, and strict SQL guardrails to prevent invalid MCE commands.

**Architecture:** pnpm monorepo with a Zero-Data Proxy pattern—the backend proxies MCE data without storing it.

## Monorepo Structure

```
apps/
├── api/             # NestJS/Fastify backend (auth, metadata proxy, sessions)
├── web/             # Vite/React frontend (Monaco-based IDE, Zen Mode UI)
├── worker/          # Node.js/BullMQ worker (Shell Query execution)
├── backoffice/      # Backoffice admin web UI
└── backoffice-api/  # Backoffice admin API

packages/
├── backend-shared/  # Shared backend services (MCE SOAP proxying, etc.)
├── database/        # Drizzle ORM schemas (PostgreSQL 16)
├── schema-inferrer/ # Schema inference utility
├── shared-types/    # Zod schemas and TypeScript types
├── test-utils/      # Shared test utilities and factories
└── eslint-config/   # Centralized linting rules
```

## Development Commands

```bash
# Start infrastructure (PostgreSQL + Redis)
cp .env.example .env               # First-time only
docker-compose up -d

# Install dependencies
pnpm install

# Run API + web + worker concurrently
pnpm dev

# Run individual apps
pnpm api:dev                       # API in watch mode (builds packages first)
pnpm web:dev                       # Web dev server
pnpm worker:dev                    # Worker in watch mode

# Full stack with Stripe webhook listener
pnpm dev:startup

# Build all packages
pnpm -r build

# Database operations
pnpm db:generate                   # Generate Drizzle migrations
pnpm db:migrate                    # Run migrations

# Testing
pnpm test                          # Run all tests
pnpm test:api                      # API tests only (builds packages first)
pnpm test:web                      # Web tests only (builds packages first)
pnpm test:worker                   # Worker tests only (builds packages first)
pnpm test:e2e                      # E2E tests
pnpm test:integration              # Integration tests (api, worker, database, backend-shared)
pnpm test:coverage                 # Coverage report

# Linting and type checking
pnpm lint                          # Lint all packages
pnpm typecheck                     # Type check all packages

# Backoffice
pnpm backoffice:dev                # Run backoffice API + web concurrently
pnpm backoffice:api:dev            # Backoffice API only
pnpm backoffice:web:dev            # Backoffice web only
pnpm backoffice:seed               # Seed backoffice admin user
```

## Tech Stack

- **Frontend:** React 18, Vite, TypeScript, Monaco Editor, Zustand, TanStack Query, Tailwind CSS, Radix UI
- **Backend:** NestJS 11, Fastify 5, PostgreSQL 16, Drizzle ORM
- **Worker:** BullMQ, Redis
- **Testing:** Vitest

## Code Conventions

**Imports:** Use `@` alias for src imports (e.g., `import { Button } from '@/components/ui/Button'`).

**TypeScript:** Strict mode. No `any`. Prefix unused args with `_`. Console limited to `warn`/`error` only.

**Formatting:** Prettier is used for code formatting (`apps/api` has a `format` script).

**Comments:** Comments are the exception, not the rule. Code should be self-documenting.

*Acceptable comments:*
- Explaining *why* behind a non-obvious decision or exception
- JSDoc for public APIs that external consumers will use

*Unacceptable comments:*
- "Fix for X" or changelog-style notes (that's what git history is for)
- Describing what the code does (the code shows that)
- Commented-out code (delete it; git has history)

**State Management (Frontend):**
1. Local state: `useState` for form inputs, UI toggles
2. Global state: Zustand for app-wide UI state
3. Server state: TanStack Query for API data

**Backend:**
- Row-level security via PostgreSQL `app.tenant_id` and `app.mid` context
- Feature-based module organization (AuthModule, UsersModule, MceModule)
- RESTful endpoints with `/api` prefix

**Testing:** Vitest with `*.spec.ts` or `*.test.ts` pattern. Follow Arrange-Act-Assert structure.

**Commits:** Conventional Commits format (e.g., `feat(web): add auth UI`, `fix(api): handle redirect`). **No mention of phases, tasks, specs, or similar in commit messages**—just what was done and why.

**Pull Requests:** PRs should include:
- A short summary of changes
- Test notes (commands run to verify)
- Linked issues if applicable
- Screenshots or recordings for UI changes in `apps/web`

## Standards Documentation

Refer to `agent-os/standards/` for detailed conventions:
- `global/` - Architecture, coding-style, naming, security
- `backend/` - API standards, queries, migrations
- `frontend/` - Component design, state-management, styling, accessibility
- `testing/` - TDD philosophy, factory patterns, test structure

**IMPORTANT:** Ignore `agent-os/standards/backend-intent/`—it contains legacy documents that conflict with current architecture.

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

## Gotchas

- **Pre-commit hook** runs `lint-staged` and a security check that blocks any non-test `*.ts` file under `apps/*/src` containing `qs_migrate`. This prevents the migration-only DB role from leaking into production code.
- **QS Pro runs inside an MCE iframe, not standalone.** The app is accessed at `https://mc.s12.exacttarget.com/cloud/#app/Query%2B%2B` inside a logged-in Salesforce Marketing Cloud tenant — NOT at `localhost:5173`. Use `pnpm tunnel:dev` to tunnel localhost to `dev.queryplusplus.app` (the URL MCE loads in the iframe), then open the MCE URL above.
- **Browser verification requires a headed browser.** Playwright MCP tools don't work in WSL without a display server. Use `playwright-cli --headed` with XLaunch (VcXsrv) running on Windows. The user must authenticate to MCE manually before any automated interaction — wait for their confirmation.

## Local Ports

- Frontend (web): 5173
- Frontend (backoffice): 5174
- Backend API: 3000
- Backoffice API: 3002
- Worker: 3001
- PostgreSQL: 5432
- Redis: 6379

## Git Worktree Infrastructure

This project uses `worktree-compose` (`wtc`) for per-worktree Docker isolation. Each worktree gets its own Postgres and Redis on unique ports — no conflicts with other worktrees or the main checkout.

**After creating a git worktree:**

```bash
wtc start          # Starts isolated Postgres + Redis with unique ports
pnpm install       # Install dependencies
pnpm db:migrate    # Run migrations against the worktree's database
```

**When cleaning up a worktree:**

```bash
wtc stop                          # Tears down containers (preserves volumes)
git worktree remove <path>        # Removes the worktree
```

**Do NOT** use the main worktree's database (port 5432) from a secondary worktree. Each worktree's `wtc start` injects the correct ports into `.env` automatically.

**Running tests in a worktree** works identically to the main checkout — `pnpm test`, `pnpm --filter api test:integration`, etc. — because `wtc` remaps ports in the environment.
