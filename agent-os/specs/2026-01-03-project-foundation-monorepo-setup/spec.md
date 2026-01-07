# Specification: Project Foundation & Monorepo Setup

## Goal
Initialize the project foundation and monorepo structure to enable future development and testing.

## User Stories
- As a developer, I want a monorepo structure set up with `pnpm` workspaces so that I can manage dependencies efficiently.
- As a developer, I want the backend and frontend apps scaffolded so that I can start building features.
- As a developer, I want a shared database and types package so that I can reuse code across apps.
- As a developer, I want Docker Compose set up for Postgres and Redis so that I have a local development environment.

## Specific Requirements

**Monorepo & Tooling**
- Initialize `pnpm` workspaces with `apps/` and `packages/` directories.
- Set up `docker-compose.yml` with PostgreSQL (v16) and Redis services.
- Configure `packages/eslint-config` with `eslint-plugin-security` and strict TypeScript rules.

**Backend (NestJS)**
- Scaffold `apps/api` using NestJS with Fastify adapter.
- Implement a basic "Health Check" endpoint (GET /health).
- Create a stubbed "Auth" controller structure (no logic yet).
- Integrate `zod` for environment variable validation (DB_URL, etc.).

**Frontend (React)**
- Scaffold `apps/web` using Vite + React 19 + TypeScript.
- Create folder structure: `src/{bridge,core,features,services,store}`.
- Setup `src/bridge` directory for future MCE PostMessage logic.

**Worker (Node.js)**
- Scaffold `apps/worker` as a basic Node.js service.
- Install `bullmq` and configure basic connection to Redis.

**Shared Packages**
- Create `packages/database`: Install `drizzle-orm` and `pg`. Export connection setup.
- Create `packages/shared-types`: Setup for exporting Zod schemas and TypeScript interfaces.

## Visual Design
No visual assets provided.

## Existing Code to Leverage
No existing code to leverage.

## Out of Scope
- Full OAuth 2.0 implementation.
- Database schema definitions (tables).
- Real API calls to MCE.
- UI feature implementation (Editor, Sidebar).
