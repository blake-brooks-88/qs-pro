# Product Roadmap

## Phase 1: Core IDE & Foundation
1. [x] **Project Foundation & Monorepo Setup** — Initialize project, Docker (Redis/Postgres), and implement the Tenant-Aware Repository pattern with Drizzle ORM. `S`
2. [x] **Authentication & Token Wallet** — Implement App Switcher (JWT) SSO flow, Web App OAuth handshake, and the secure "Token Wallet" for encrypted refresh tokens. `M`
3. [x] **Enhanced Package App Login Flow** — Refactor App Switcher login to use iframe GET + OAuth authorization code + `v2/userinfo` for enhanced packages, with proper session cookies. `S`
4. [x] **Enhanced Package OAuth Documentation & Regression Tests** — Document the MCE iframe OAuth flow and add tests that assert `v2/userinfo` mapping and callback behavior. `S`
5. [x] **MCE Bridge & Metadata Discovery** — Build the "Bridge" utility (auto-signing, TSSD resolution) and iteratively implement discovery for Folders, DEs, and Field definitions. `M`
6. [ ] **Shell Query Engine (Backend)** — Build the BullMQ worker for "Shell Query" orchestration, Asset Recycling (Shell/Temp DEs), and the Pass-through streaming API. `L`
   - **Dev/Prod routing requirement:** `/` must serve the web app (SPA) and `/api/*` must reach the API; if `/` is unreachable, Cloudflare will return a framed error page and the MCE iframe will appear blank.
   - **Embed/session requirement:** session cookie must be `Secure` + `SameSite=None` for MCE iframe; production should use a single public origin with `/api/*` rewrites (e.g., Vercel rewrites to Heroku) to keep cookies same-origin.
7. [x] **Sidebar & Schema Explorer (Frontend)** — Implement the primary sidebar with Lazy-Loaded Metadata for Data Extensions, folders, and the Snippet Library. `M`
7b. [x] **Sidebar DE search (Frontend)** — Enable users to search for DEs in the sidebar by leveraging the metadata cache. `M`
8. [ ] **Query Execution & Results Viewer** — Implement the "Run to Temp" execution flow, response streaming, and the Virtualized Grid. `M`
9. [ ] **Target DE Wizard & Automation Deployment** — Build the "Target DE" configuration wizard and the "Deploy to Automation" (Save Activity) functionality. `L`
10. [ ] **Observability & Monitoring (Infrastructure)** — Implement centralized logging, performance tracing, and health monitoring. `M`
11. [ ] **Security Hardening & Review Prep** — Implement strict CSP, Input Sanitization (Zod), and Audit Logging. `M`
12. [ ] **Database Row Level Security (RLS)** — Enforce tenant/BU isolation with Postgres RLS policies. `M`
13. [ ] **Support/Admin Access Controls** — Add an audited, least-privilege cross-tenant support path. `M`
14. [ ] **Secrets Management** — Store all sensitive secrets in a managed secrets system with rotation and audit logs. `M`
15. [ ] **Monetization & Paywall Implementation** — Implement the two-tier subscription model (Free/Pro) and integrate license management (LMA). `M`

## Phase 2: Advanced ISV Features (Enterprise Tier)
16. [ ] **System Data View "Scenario Builder"** — Pre-built join templates for complex Data View queries (e.g., Journey/Click/Open flows). `M`
17. [ ] **Pre-Flight Query Validation** — Detect Primary Key conflicts and nullability violations *before* saving to Target DEs. `M`
18. [ ] **Team Libraries & Collaborative Folders** — Multi-user snippet sharing with private/shared scoping and permissions. `M`
19. [ ] **Query Performance Analyzer** — Intelligence linter to detect non-indexed joins and "30-minute timeout" risks. `L`
20. [ ] **Multi-BU Bulk Deployment** — Orchestrate the deployment of Query Activities and DEs to multiple Business Units via SOAP. `L`

> Notes
> - Order follows the PRD's "Development Phases": Foundation -> Auth -> Engine -> UI.
> - Critical path involves establishing the "Pass-through" proxy architecture early to ensure security compliance.
