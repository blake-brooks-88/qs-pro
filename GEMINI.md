# Gemini Context: Query++ (QS Pro)

Query++ is an ISV-grade SQL Integrated Development Environment (IDE) tailored for Salesforce Marketing Cloud Engagement (MCE) Architects and Campaign Managers. It focuses on reducing development time and eliminating runtime failures through a "Zen Mode" interface, intelligent autocomplete, and strict SQL guardrails.

## Project Overview

- **Core Concept:** A specialized SQL IDE for MCE that prevents invalid commands (like `UPDATE` or `DELETE`) and provides real-time schema awareness.
- **Architecture:** A pnpm-based monorepo following a Zero-Data Proxy (pass-through) pattern to ensure security and ISV compliance.
- **Primary Technology Stack:**
  - **Frontend:** React 19, Vite, TypeScript, Monaco Editor, Zustand, TanStack Query, Tailwind CSS.
  - **Backend:** NestJS with Fastify Adapter, PostgreSQL 16 (via Drizzle ORM).
  - **Worker:** Node.js, BullMQ, Redis.
  - **Infrastructure:** Docker Compose for local development (PostgreSQL & Redis).

## Monorepo Structure

### Applications (`apps/`)
- **`api`**: NestJS/Fastify backend handling authentication (MCE OAuth2), metadata proxying, and session management.
- **`web`**: Vite/React frontend featuring the Monaco-based IDE, "Zen Mode" UI, and virtualized results grid.
- **`worker`**: Node.js/BullMQ worker for orchestrating "Shell Query" execution and asset recycling.

### Shared Packages (`packages/`)
- **`database`**: Drizzle ORM schemas and connection utilities for PostgreSQL.
- **`shared-types`**: Zod-based schemas and TypeScript types shared across the monorepo.
- **`eslint-config`**: Centralized linting rules and security plugins.

## Building and Running

### Development Environment
1. **Initialize Infrastructure:**
   ```bash
   docker-compose up -d
   ```
   *Note: This starts PostgreSQL 16 and Redis.*

2. **Install Dependencies:**
   ```bash
   pnpm install
   ```

3. **Build All Packages:**
   ```bash
   pnpm -r build
   ```

### Running Applications
- **API:** `cd apps/api && pnpm start:dev`
- **Frontend:** `cd apps/web && pnpm dev`
- **Worker:** `cd apps/worker && pnpm start`

### Testing
- **API (Jest):** `cd apps/api && pnpm test`
- **Global:** `pnpm -r test`

## Development Conventions

- **Imports:** Always use `@` alias imports instead of relative imports where configured.
- **Standards:** Refer to the `agent-os/standards/` directory for exhaustive documentation.
- **IMPORTANT:** Ignore the `agent-os/standards/backend-intent/` directory entirely. It contains legacy "intent" documents that conflict with the actual project architecture (e.g., they use "organizations" instead of the established "tenants" pattern). Use `agent-os/standards/backend/` instead.
- **Design Philosophy:** "Zen Mode" First—maximize screen real estate, eliminate extraneous sidebars (Activity Bars), and prioritize context-aware autocomplete over memorization.
- **Guardrails:** Real-time linting for MCE SQL restrictions (SELECT only, no procedural elements, 6-month retention warnings for system views).

## Key Metadata
- **Database:** PostgreSQL 16 (Drizzle ORM)
- **Cache/Queue:** Redis (BullMQ)
- **Validation:** Zod (pervasive across types and API)
- **Editor:** Monaco Editor (customized for Spectra Kinetic styling)
