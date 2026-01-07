# Task Breakdown: Project Foundation & Monorepo Setup

## Overview
Total Tasks: 4 Groups

## Task List

### Infrastructure & Monorepo

#### Task Group 1: Monorepo & Tooling Setup
**Dependencies:** None

- [x] 1.0 Initialize Monorepo Structure
  - [x] 1.1 Verify pnpm installation and version
    - Ensure pnpm is installed and compatible with Node.js version
  - [x] 1.2 Initialize pnpm workspaces
    - Create `pnpm-workspace.yaml` defining `apps/*` and `packages/*`
  - [x] 1.3 Create base directories
    - `apps/api`, `apps/web`, `apps/worker`
    - `packages/database`, `packages/shared-types`, `packages/eslint-config`
  - [x] 1.4 Setup Docker Compose
    - Create `docker-compose.yml` in root
    - Add `postgres` service (v16) with persistent volume
    - Add `redis` service (alpine)
    - Verify containers spin up correctly (`docker-compose up -d`)

**Acceptance Criteria:**
- `pnpm install` works in root
- Workspaces are correctly recognized
- `docker-compose up` starts Postgres and Redis without errors

### Shared Packages

#### Task Group 2: Shared Library Configuration
**Dependencies:** Task Group 1

- [x] 2.0 Configure Shared Packages
  - [x] 2.1 Setup `packages/eslint-config`
    - Initialize package.json
    - Install `eslint`, `typescript`, `@typescript-eslint/parser`
    - Install `eslint-plugin-security`
    - Export a strict config object
  - [x] 2.2 Setup `packages/shared-types`
    - Initialize package.json
    - Install `zod`
    - Export a dummy Zod schema (e.g., `EnvVarSchema`) to verify import/export works
  - [x] 2.3 Setup `packages/database`
    - Initialize package.json
    - Install `drizzle-orm`, `postgres`, `dotenv`
    - Create `src/index.ts` exporting a basic connection function
    - Create `drizzle.config.ts` (even if empty schema for now)

**Acceptance Criteria:**
- All packages can be built (if build step exists) or imported
- ESLint config can be consumed by apps
- Database package can connect to the Docker Postgres instance

### Backend Applications

#### Task Group 3: Backend Scaffolding (API & Worker)
**Dependencies:** Task Group 2

- [x] 3.0 Scaffold Backend Apps
  - [x] 3.1 Initialize `apps/api` (NestJS)
    - Use NestJS CLI or manual setup
    - Install `fastify`, `@nestjs/platform-fastify`, `@nestjs/config`, `@nestjs/passport`, `passport`, `passport-oauth2`
    - Configure `main.ts` to use FastifyAdapter
    - Import `packages/database` and `packages/shared-types` to verify linking
  - [x] 3.2 Implement Health Check & Auth Stub
    - Create `AppController` with `@Get('/health')` returning `{ status: 'ok' }`
    - Create `AuthModule` and `AuthController` (stubbed)
    - Create `MceStrategy` class extending `PassportStrategy` (stubbed)
  - [x] 3.3 Initialize `apps/worker` (Node.js)
    - Initialize package.json
    - Install `bullmq`, `dotenv`
    - Create `src/index.ts` with basic Redis connection check

**Acceptance Criteria:**
- `apps/api` starts and serves `GET /health`
- `apps/worker` starts and connects to Redis
- Both apps successfully import code from `packages/*`

### Frontend Application

#### Task Group 4: Frontend Scaffolding (React)
**Dependencies:** Task Group 2

- [x] 4.0 Scaffold Frontend App
  - [x] 4.1 Initialize `apps/web` (Vite + React)
    - Use `create-vite` with React + TypeScript template
    - Install `zustand`, `@tanstack/react-query`, `axios`
  - [x] 4.2 Create Folder Structure
    - `src/bridge` (Create `connector.ts` stub)
    - `src/core`, `src/features`, `src/services`, `src/store`
  - [x] 4.3 Configure Linting & Types
    - Extend `packages/eslint-config`
    - Consume a type from `packages/shared-types` in `App.tsx` to verify linking

**Acceptance Criteria:**
- `apps/web` builds and serves via `pnpm dev`
- Folder structure matches requirements
- Imports from shared packages work correctly

## Execution Order
1. Infrastructure & Monorepo (Task Group 1)
2. Shared Packages (Task Group 2)
3. Backend Applications (Task Group 3)
4. Frontend Application (Task Group 4)
