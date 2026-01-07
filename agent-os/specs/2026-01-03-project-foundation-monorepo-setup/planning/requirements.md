# Spec Requirements: 2026-01-03-project-foundation-monorepo-setup

## Initial Description
Enable project setup and project structure. Initialize and set up so I can start executing test api calls in the next spec.

## Requirements Discussion

### First Round Questions

**Q1:** I assume we should use `pnpm` workspaces for the monorepo setup (given the package structure in your request). Is that correct, or do you prefer `npm` workspaces or `yarn` workspaces?
**Answer:** I'm okay wiht pnpm then! (Additional context: User asked about differences, accepted pnpm for its speed and security benefits for ISV-grade apps).

**Q2:** I'm thinking of setting up the Docker Compose configuration to include just PostgreSQL and Redis for now (to support the future BullMQ and data needs). Should we also include any other services like a local mail catcher or adminer?
**Answer:** let's just stick with those for now

**Q3:** I assume the `api` (NestJS) and `worker` (Node.js) will share the database schema and types. Should I set up the `packages/database` and `packages/shared-types` as buildable libraries that are consumed by both apps?
**Answer:** sure

**Q4:** For the `bridge` (MCE PostMessage Anti-Corruption Layer) in the frontend structure, I assume this should be a dedicated module within the `web` app for now. Or do you see this potentially being a shared package later if you have multiple frontend apps?
**Answer:** will just have one frontend

**Q5:** You mentioned "Strict Security Rules" for `eslint-config`. I assume this means extending configurations like `eslint-plugin-security` and strict TypeScript rules. Is that correct, or do you have a specific rigorous config in mind (e.g., Airbnb, Google)?
**Answer:** I just want to follow best practices. if there are security plugins we can use then great

**Q6:** Regarding the "Token Wallet" and encryption mentioned in the roadmap (though this spec is foundation), I assume for the foundation phase we just need to set up the *structure* for where these secrets will live (e.g., environment variable validation with Zod) without implementing the full encryption logic yet. Is that correct?
**Answer:** yes, that's correct. we're just initializing the project and making sure it makes sense for the app I'm trying to build

### Follow-up Questions

**Follow-up 1:** You mentioned executing test API calls in the next spec. To support this foundation, I assume you want the `api` app to have a basic "health check" endpoint and perhaps a stubbed "auth" endpoint structure ready to receive the logic later. Is that sufficient for the "test api calls" goal?
**Answer:** yes, that works for me. I want the foundation laid and in the next task I want to focus on how to handle auth, strucutring the tables, then I want to focus on being able to start testing some API calls in a real account

### Existing Code to Reference
No similar existing features identified for reference.

## Visual Assets
No visual assets provided.

## Requirements Summary

### Functional Requirements
- **Monorepo Setup:** Initialize a `pnpm` workspace structure.
- **Backend (API):** Scaffold a NestJS application (`apps/api`) with a basic "health check" endpoint and stubbed "auth" controller.
- **Backend (Worker):** Scaffold a Node.js/BullMQ worker application (`apps/worker`).
- **Frontend:** Scaffold a React + Vite application (`apps/web`) with the specified folder structure (bridge, core, features, services, store).
- **Database Package:** Create `packages/database` with Drizzle ORM and PostgreSQL connection setup.
- **Shared Types:** Create `packages/shared-types` for Zod schemas and DTOs.
- **ESLint Config:** Create `packages/eslint-config` with strict security plugins.
- **Infrastructure:** `docker-compose.yml` for PostgreSQL and Redis.
- **Environment:** Validation using Zod for ensuring required env vars exist (DB_URL, REDIS_URL, etc.).

### Reusability Opportunities
- **Shared Database:** The `api` and `worker` apps will share the `packages/database` module.
- **Shared Types:** API interfaces and Validation schemas will be shared across frontend and backend via `packages/shared-types`.

### Scope Boundaries
**In Scope:**
- Monorepo initialization (pnpm)
- App scaffolding (Web, API, Worker)
- Package scaffolding (Database, Types, Config)
- Docker Compose (Postgres, Redis)
- Basic Health Check API
- Project folder structure setup

**Out of Scope:**
- Full Authentication implementation (OAuth flow)
- Database tables (Schema definition) - *Deferring to next task*
- Real API testing against MCE - *Deferring to next task*
- Feature implementation (Editor, Sidebar, etc.)

### Technical Considerations
- **Package Manager:** `pnpm` for efficient dependency management and security.
- **Security:** Strict ESLint rules (eslint-plugin-security) and input validation structure (Zod).
- **Architecture:** Hybrid AppExchange ready (NestJS + React + Postgres).
- **Compliance:** Foundation must support future Security Review requirements (secure config, strict types).
