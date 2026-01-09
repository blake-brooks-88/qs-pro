# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QS Pro (Query++) is an ISV-grade SQL IDE for Salesforce Marketing Cloud Engagement (MCE). It provides a "Zen Mode" interface, intelligent autocomplete, and strict SQL guardrails to prevent invalid MCE commands.

**Architecture:** pnpm monorepo with a Zero-Data Proxy pattern—the backend proxies MCE data without storing it.

## Monorepo Structure

```
apps/
├── api/      # NestJS/Fastify backend (auth, metadata proxy, sessions)
├── web/      # Vite/React frontend (Monaco-based IDE, Zen Mode UI)
└── worker/   # Node.js/BullMQ worker (Shell Query execution)

packages/
├── database/      # Drizzle ORM schemas (PostgreSQL 16)
├── shared-types/  # Zod schemas and TypeScript types
└── eslint-config/ # Centralized linting rules
```

## Development Commands

```bash
# Start infrastructure (PostgreSQL + Redis)
docker-compose up -d

# Install dependencies
pnpm install

# Run API + web concurrently
pnpm dev

# Run individual apps
pnpm api:dev                       # API in watch mode (kills :3000 first)
pnpm web:dev                       # Web dev server

# Database operations
pnpm db:generate                   # Generate Drizzle migrations
pnpm db:migrate                    # Run migrations

# Testing
pnpm test                          # Run all tests
pnpm --filter api test             # API tests only
pnpm --filter @qs-pro/web test     # Web tests only
pnpm --filter api test:e2e         # API e2e tests

# Linting and type checking
pnpm lint                          # Lint all packages
pnpm typecheck                     # Type check all packages
```

## Tech Stack

- **Frontend:** React 18, Vite, TypeScript, Monaco Editor, Zustand, TanStack Query, Tailwind CSS, Radix UI
- **Backend:** NestJS 11, Fastify 5, PostgreSQL 16, Drizzle ORM
- **Worker:** BullMQ, Redis
- **Testing:** Vitest

## Code Conventions

**Imports:** Use `@` alias for src imports (e.g., `import { Button } from '@/components/ui/Button'`).

**TypeScript:** Strict mode. No `any`, no `console`. Prefix unused args with `_`.

**State Management (Frontend):**
1. Local state: `useState` for form inputs, UI toggles
2. Global state: Zustand for app-wide UI state
3. Server state: TanStack Query for API data

**Backend:**
- Row-level security via PostgreSQL `app.tenant_id` and `app.mid` context
- Feature-based module organization (AuthModule, UsersModule, MceModule)
- RESTful endpoints with `/api` prefix

**Testing:** Vitest with `*.spec.ts` or `*.test.ts` pattern. Follow Arrange-Act-Assert structure.

**Commits:** Conventional Commits format (e.g., `feat(web): add auth UI`, `fix(api): handle redirect`).

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

## Local Ports

- Frontend: 5173
- Backend API: 3000
- PostgreSQL: 5432
- Redis: 6379
