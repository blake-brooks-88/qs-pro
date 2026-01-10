# Product Roadmap

This roadmap outlines the development phases for Query++ (QS Pro), progressing from core IDE functionality through enterprise features to a production-ready AppExchange listing.

**Key Principle:** Security and observability infrastructure is built in Phase 1 so that all subsequent features are instrumented from the start—no painful retrofits.

**Checklist mapping:** Roadmap items reference section numbers in `docs/security-review-materials/APPEXCHANGE-SECURITY-REVIEW-CHECKLIST.md` (example: "Checklist: 6" = Authentication and Session Management).

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-10 | **Launch Slice restructure** — Added usage caps model, defined true MVP scope, deferred Enterprise to post-launch. Based on 8-audit synthesis. Previous roadmap: `7b88b82` |
| 2026-01-10 | Added feature tier definitions (Core/Pro/Enterprise) based on brainstorming session. Added version control and promotion features. Reorganized Phase 3 to align with tier structure. |

---

## Feature Tiers

Features are organized into three tiers based on target buyer and value proposition:

| Tier | Target Buyer | Value Proposition |
|------|--------------|-------------------|
| **Core/Free** | Individual developers, consultants | "Stop the bleeding" — modern editor with usage caps |
| **Pro** | Power users, individual architects | "Productivity + persistence" — unlimited usage, version history, deploy |
| **Enterprise** | Teams, agencies, global brands | "Governed promotion + collaboration" — QA→Prod, RBAC, audit |

### Usage Caps Model

Usage caps create natural upgrade pressure while keeping Core valuable:

| Capability | Core/Free | Pro | Enterprise |
|------------|-----------|-----|------------|
| Query runs | 50/month | Unlimited | Unlimited |
| Saved queries | 10 | Unlimited | Unlimited |
| Version history | ✗ | ✓ | ✓ |
| One-way deploy | ✗ | ✓ | ✓ |
| QA→Prod promotion | ✗ | ✗ | ✓ |
| Team workspaces | ✗ | ✗ | ✓ |
| Audit log viewer | ✗ | ✗ | ✓ |

See "Launch Slice" for what ships in v1.0.

---

## How to Read This

- This roadmap is intentionally high-level; each item should be "spec-able" without fully defining all epic details here.
- Items include key constraints and "already implemented" notes so we don't re-plan work that's already done.
- **Sizing:** `S` = Small (1-2 days), `M` = Medium (3-5 days), `L` = Large (1-2 weeks)

---

## Launch Slice (v1.0)

**This is what must ship for AppExchange launch. Everything else is post-launch.**

The goal: A user can connect their MCE org, write a query with autocomplete, run it, see results, and save it — in under 5 minutes. Pro users get unlimited usage + version history. Enterprise is deferred until Pro customers ask for governance.

### v1.0 Scope

#### Core Tier (Free with Caps)
- [x] Monaco editor + syntax highlighting
- [x] DE/field autocomplete (from metadata cache)
- [x] Data Views autocomplete + joins
- [x] MCE-specific linting
- [ ] **Query execution (Web↔API↔Worker)** — THE critical path
- [ ] **Saved queries** — basic persistence (10 query cap for free)
- [ ] **Usage caps enforcement** — 50 runs/month, 10 saved queries
- [ ] Keyboard shortcuts (Cmd+Enter to run)

#### Pro Tier (14-Day Trial, Then Subscription)
- [ ] **Unlimited query runs** — cap lifted
- [ ] **Unlimited saved queries** — cap lifted
- [ ] **Linear version history + rollback** — never lose work
- [ ] **Query execution history** — view past runs
- [ ] **One-way deploy to Query Activity** — fire and forget

#### Security Baseline (AppExchange Required)
- [ ] RLS coverage audit + enforcement tests
- [ ] Session lifecycle compliance (logout, timeout)
- [ ] Embedded app baseline security (CSP, cookies, CSRF)
- [ ] Input validation patterns (Zod across API)
- [ ] Client-safe error contract

#### Monetization
- [ ] LMA integration for license verification
- [ ] Upgrade prompts when caps hit
- [ ] Pro trial activation (14 days full access)

### Deferred to Post-Launch

| Feature | Reason |
|---------|--------|
| Enterprise tier (all features) | Build when Pro customers ask for governance |
| Smart Fix-It | Nice-to-have, not launch critical |
| Performance Linting | MCE doesn't expose data; wait for signal |
| Sample Value Hover | Edge case |
| Query prettify/format | Can ship post-launch |
| Import from Automation Studio | Can ship post-launch |
| Create target DE from query | Can ship post-launch |
| Silent auto-retry | Can ship post-launch |
| Multiple editor tabs | Can ship post-launch |
| Personal snippets | Can ship post-launch |
| Pre-flight validation | Can ship post-launch |

### Success Criteria

- [ ] First-run loop works: connect → write → run → see results → save
- [ ] Time-to-first-query < 5 minutes for new users
- [ ] Pro trial converts at ≥5% (B2B freemium benchmark)
- [ ] AppExchange security review passes

---

## Phase 1: Core Product & Foundational Infrastructure

The foundation phase establishes the core product AND the infrastructure patterns that all future features will use. This includes audit logging, observability, validation patterns, and usage tracking—built once, used everywhere.

### Completed

- [x] **Project Foundation & Monorepo Setup** — Initialize project, Docker (Redis/Postgres), and implement the Tenant-Aware Repository pattern with Drizzle ORM. `S`
  - Checklist: 5 (Injection prevention foundations), 11 (Database/Redis foundations)
- [x] **Authentication & Token Wallet** — Implement App Switcher (JWT) SSO flow, Web App OAuth handshake, and the secure "Token Wallet" for encrypted refresh tokens. `M`
  - Checklist: 6 (OAuth + session management), 7 (MCE enhanced package requirements), 8 (Token encryption at rest)
- [x] **Enhanced Package App Login Flow** — Refactor App Switcher login to use iframe GET + OAuth authorization code + `v2/userinfo` for enhanced packages, with proper session cookies. `S`
  - Checklist: 6 (Session security), 7 (Iframe embedding + cookie constraints)
- [x] **Enhanced Package OAuth Documentation & Regression Tests** — Document the MCE iframe OAuth flow and add tests that assert `v2/userinfo` mapping and callback behavior. `S`
  - Checklist: 6 (OAuth correctness), 7 (User context mapping)
- [x] **MCE Bridge & Metadata Discovery** — Build the "Bridge" utility (auto-signing, TSSD resolution) and implement discovery for folders, DEs, and field definitions. `M`
  - Checklist: 7 (Server-side API authentication; no browser tokens), 9 (API security / proxy behavior)
- [x] **Sidebar & Schema Explorer (Frontend)** — Primary sidebar with lazy-loaded metadata for Data Extensions, folders, and schema. `M`
  - Checklist: 10 (Frontend security)
- [x] **Sidebar DE Search (Frontend)** — Search for DEs in the sidebar using the metadata cache. `S`
  - Checklist: 10 (Frontend security)
- [x] **Database Row Level Security (RLS)** — Tenant/BU isolation with Postgres RLS policies + per-request context binding. `M`
  - Checklist: 5 (Broken access control), 11 (Database security)
- [x] **Feature Flag Infrastructure** — Tier-based feature gating with `FeatureGate` component, `useFeature` hook, and per-tenant overrides. `M`
  - Checklist: 5 (Least privilege / access control support)
- [x] **Editor Guardrails & Autocomplete v1** — Monaco editor with modular SQL linting (MCE-aligned), contextual autocomplete, inline suggestions, and tests. `L`
  - Authoritative reference: `apps/web/src/features/editor-workspace/utils/sql-lint/MCE-SQL-REFERENCE.md`
  - Checklist: 5 (Injection prevention / guardrails), 10 (Frontend security)

### Core Product Features (Next)

- [x] **Shell Query Engine (Backend)** — BullMQ worker for "Shell Query" orchestration, asset recycling (shell/temp DEs), and pass-through results access. `L`
  - API endpoints exist: `POST /api/runs`, `GET /api/runs/:runId/events` (SSE), `GET /api/runs/:runId/results`
  - Rate limiting exists: per-user concurrent run cap + per-user SSE connection cap
  - Embedded requirement: `Secure` + `SameSite=None` cookies for MCE iframe embedding
  - Checklist: 6 (Session + CSRF posture), 8 (Zero-data proxy pattern), 9 (Rate limiting + API auth)

- [ ] **Query Execution (Web↔API↔Worker) & Results Viewer** — Wire editor “RUN” to backend runs, status streaming, and paged results. `M`
  - Already in place (web UI): results pane UI exists, but `apps/web/src/features/editor-workspace/EditorWorkspacePage.tsx` currently doesn’t call the API.
  - Spec notes: keep results “zero-data proxy” (no row persistence), use paging, and degrade gracefully on upstream SFMC errors/timeouts.
  - Wire CSRF end-to-end: attach `x-csrf-token` to all state-changing requests and add tests that assert requests without CSRF are rejected.
  - Checklist: 6 (Session security), 8 (Zero-data proxy), 9 (CSRF + API security + error handling)

- [ ] **Saved Queries & History (User Persistence)** — Queries persist across sessions; users can organize and return to work quickly. `M`
  - Already in place (DB): `query_history` table exists in `packages/database/src/schema.ts`.
  - Already in place (UI scaffolding): sidebar supports `savedQueries`, but it’s currently fed an empty list.
  - Spec notes: define “saved query” vs “run history”, retention per tier, and BU scoping.
  - Checklist: 5 (Access control), 8 (Retention policies), 9 (Input validation)

- [ ] **Target DE Wizard & Automation Deployment** — “Run to Target” + “Deploy to Automation” (Query Activity) end-to-end. `L`
  - Already in place (UI scaffolding): `apps/web/src/features/editor-workspace/components/QueryActivityModal.tsx` exists; needs backend implementation and wiring.
  - Spec notes: idempotency (avoid duplicates), naming rules, and clear rollback when SFMC operations partially fail.
  - Checklist: 5 (Authorization), 6 (CSRF on state-changing operations), 9 (Input validation + error handling)

- [ ] **Snippet Library v1 (Persistence + CRUD)** — Backend endpoints + UI wiring for saving/reusing SQL snippets. `M`
  - Already in place (DB): `snippets` table exists in `packages/database/src/schema.ts`.
  - Spec notes: keep sharing rules aligned with workspace model (Phase 2) so we don’t rewrite later.
  - Checklist: 5 (Access control), 8 (Data retention/privacy), 9 (Input validation)

- [ ] **Monetization v1 (Free/Pro/Enterprise)** — Subscription tiers with Salesforce LMA integration. `M`
  - Seat limits enforcement
  - Upgrade prompts and paywall UI
  - License verification
  - Checklist: 5 (Least privilege / authorization), 9 (Abuse controls), 12 (Operational security)

### Foundational Infrastructure (Next)

These establish patterns used by ALL subsequent features. Build once, instrument everything.

- [ ] **Audit Logging Infrastructure** — Core audit system that captures events from day 1. `M`
  > See: `docs/epics/audit-logs.md`
  - `audit_logs` table with tenant-scoped, immutable event records
  - `AuditService` with `log()` method for emitting events
  - Standard event types: auth, data access, resource mutations
  - Checklist: 12 (Logging and monitoring + audit logging), 5 (Log access control failures)

- [ ] **Observability & Monitoring** — Centralized logging and tracing. `M`
  - Already in place: health endpoints exist in API + worker; worker exposes Prometheus metrics and Bull Board.
  - Structured logging with correlation IDs (API + worker, consistent fields)
  - Tracing (OpenTelemetry or similar), including upstream SFMC calls
  - Error tracking (Sentry or similar) replacing the current stub in `apps/api/src/common/filters/global-exception.filter.ts`
  - Health endpoints should cover DB/Redis dependency checks (not just “ok”)
  - Ensure operational endpoints are protected or private-network-only (e.g. worker `/metrics`), and included in the external asset inventory for scanning.
  - Checklist: 12 (Operational security), 4 (Host and platform security), 11 (Infrastructure security)

  > **Operational Dashboards (FYI):**
  > - **Bull Board** — available at `/admin/queues` on worker service for queue monitoring (protected by `ADMIN_API_KEY`)
  > - **Prometheus Metrics** — exposed at `/metrics` on worker service (job counts, duration, failures)
  > - **Recommended additions:** Grafana for metrics visualization (post-launch), PostHog for product analytics
  > - See `apps/worker/README.md` for full metrics documentation

- [ ] **Input Validation Patterns** — Zod validation across all API boundaries. `S`
  - Already in place: some endpoints validate with Zod (example: shell query run creation).
  - Request validation middleware / global pipe
  - Consistent error response format
  - Validation schema patterns for reuse
  - Checklist: 5 (Injection prevention), 9 (Input validation)

- [ ] **Client-Safe Error Contract** — Standardize error responses and logging so clients never receive sensitive details. `S`
  - Generic user-facing messages + stable error codes (no stack traces, no upstream payloads).
  - Detailed diagnostics only in server-side logs (with correlation IDs).
  - Checklist: 9 (Error handling), 5 (Security misconfiguration)

- [ ] **RLS Coverage Audit & Enforcement** — Ensure tenant/BU isolation applies to every tenant-scoped table (including new and future tables). `S`
  - Add/verify `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` policies for all tenant-scoped tables (including `shell_query_runs`, `tenant_settings`, and future workspace tables).
  - Add regression tests that fail if cross-tenant reads/writes are possible.
  - Checklist: 5 (Broken access control), 11 (Database security)

- [ ] **Outbound MCE Request Hardening (SOAP/REST)** — Make outbound SFMC/MCE calls safe by construction. `M`
  - XML escaping/CDATA for all SOAP-injected values; strict allowlists for identifiers used in SOAP structure.
  - Host allowlisting (SFMC endpoints only), timeouts, and max response size limits for axios calls.
  - Checklist: 5 (Injection prevention), 9 (SSRF / outbound request safety)

- [ ] **Session Lifecycle Compliance** — Complete AppExchange-aligned session controls. `S`
  - Explicit logout endpoint + session invalidation behavior.
  - Session timeout/rotation policy (configurable), with tests proving expected behavior.
  - Checklist: 6 (Session security), 7 (Iframe cookie constraints)

- [ ] **Usage Quotas & Limits** — Tier-based limits infrastructure. `M`
  - Already in place: per-user concurrency limits for shell query runs + per-user SSE connection limits.
  - Query execution quotas (per user/tenant/month)
  - Storage limits (snippets, history retention)
  - Usage tracking and enforcement (soft warnings + hard blocks)
  - Define retention windows and deletion behavior per tier (history, runs, logs) so storage and compliance requirements are explicit.
  - Checklist: 8 (Data retention), 9 (Rate limiting), 12 (Operational security)

- [ ] **Embedded App Baseline Security** — Ensure the app behaves correctly in MCE iframe constraints while staying AppExchange-friendly. `M`
  - Security headers baseline (CSP/frame-ancestors strategy, HSTS, nosniff) without breaking iframe embedding
  - Cookie posture (`SameSite=None`, `Secure`, partitioned cookies where applicable) and CSRF posture for redirects
  - CORS posture (if/where needed) and edge protection strategy (CDN/WAF)
  - Remove or lock down any stub/debug endpoints before submission (e.g. unauthenticated stubs).
  - Checklist: 10 (Frontend security / headers), 6 (Cookie posture + CSRF), 5 (Security misconfiguration)

---

## Phase 2: Team & Admin Infrastructure

This phase builds admin controls, team management, and collaboration features. All features are instrumented with audit logging as they're built (not retrofitted).

### Epic A: Enterprise Control Plane
> See: `docs/epics/enterprise-control-plane.md`

The admin and management layer that gives customers visibility and control.

- [ ] **Tenant Admin Role** — Separate tenant-level admin permissions from workspace roles. `S`
  - `tenant_admin` role for billing, settings, audit log access
  - Distinct from workspace-level roles
  - First user in tenant auto-assigned as admin
  - Checklist: 5 (Broken access control / least privilege)

- [ ] **Audit Log Viewer** — Admin UI for viewing and exporting audit trails. `M`
  - Filterable log viewer (by user, action, date range)
  - CSV/JSON export capability
  - Feature-gated to enterprise tier (logs are captured for all tiers)
  - Checklist: 12 (Audit logging)

- [ ] **Subscription Management UI** — Self-service subscription management for admins. `M`
  - View current plan and usage
  - See seat allocation and limits
  - Upgrade/downgrade flows (via Salesforce AppExchange)
  - Checklist: 5 (Authorization on admin-only settings)

### Epic B: Workspaces & Collaboration
> See: `docs/epics/workspaces-collaboration.md`

Team organization features for enterprises with multiple teams.

- [ ] **Workspaces Data Model** — Database schema for team organization within tenants. `M`
  - `workspaces` table (id, tenant_id, name, created_by)
  - `workspace_members` table (workspace_id, user_id, role)
  - Default workspace auto-creation for new tenants
  - Checklist: 5 (Broken access control), 11 (Database security/RLS)

- [ ] **RBAC (Hardcoded Roles)** — Role-based access control for workspace permissions. `M`
  - Four roles: `owner`, `admin`, `member`, `viewer`
  - Permission matrix for workspace actions
  - Backend authorization middleware
  - Checklist: 5 (Broken access control)

- [ ] **Workspace Management UI** — CRUD interface for workspace administration. `M`
  - Create/rename/delete workspaces
  - View workspace members
  - Workspace switcher in app shell
  - Checklist: 5 (Authorization)

- [ ] **Workspace Membership** — Invite and manage workspace members. `M`
  - Invite users by email
  - Accept/decline invitations
  - Change member roles
  - Remove members
  - Checklist: 5 (Authorization), 12 (Audit logging for membership changes)

- [ ] **Workspace-Scoped Snippets** — Extend snippets to support workspace sharing. `M`
  - Add `workspace_id` to snippets table
  - Visibility levels: `private`, `workspace`, `tenant`
  - RLS policies for workspace isolation
  - Checklist: 5 (Broken access control), 11 (Database security/RLS)

---

## Phase 3: Premium Features

Advanced features that differentiate Pro and Enterprise tiers. Built on top of core product and team infrastructure.

> **Brainstorming references:**
> - `docs/brainstorming/version-control/2026-01-09-query-version-control-two-way-sync-brainstorm.md`
> - `docs/brainstorming/version-control/2026-01-10-query-version-control-mvp-promotion-and-governance-brainstorm.md`

### Core/Free Tier Features

These features ship in Phase 1. See "Launch Slice" for what's in v1.0 vs post-launch.

| Feature | v1.0 Launch | Status |
|---------|-------------|--------|
| Monaco editor + syntax highlighting | ✓ | Complete |
| DE/field autocomplete (from metadata cache) | ✓ | Complete |
| Data Views autocomplete + joins (hardcoded schemas) | ✓ | Complete |
| MCE-specific linting (MCE-SQL-REFERENCE aligned) | ✓ | Complete |
| Real-time result preview (Shell Query) | ✓ | In progress |
| Keyboard shortcuts (Cmd+Enter, etc.) | ✓ | Planned |
| Usage caps (50 runs/month, 10 saved queries) | ✓ | Planned |
| Query prettify/format | Post-launch | Planned |
| Import query content from Automation Studio | Post-launch | Planned |
| Create target DE from query definition | Post-launch | Planned |
| Silent auto-retry for transient MCE errors | Post-launch | Planned |

### Pro Tier Features

Features for individual architects and power users. Value prop: "Productivity + persistence."

#### Pro Launch Features (v1.0)

- [ ] **Unlimited Query Runs** — Remove the 50/month cap. `S`
  - Tier check on run creation
  - Upgrade prompt when free users hit cap

- [ ] **Unlimited Saved Queries** — Remove the 10 query cap. `S`
  - Tier check on save
  - Upgrade prompt when free users hit cap

- [ ] **Query Execution History** — View past runs, durations, row counts. `M`
  - Per-user history of query executions
  - Filter by date, query, status
  - Re-run from history

- [ ] **Linear Version History + Rollback** — Never lose work, append-only history. `M`
  - Every save creates immutable version
  - View timeline of all changes with diff
  - Rollback = create new version with old content (nothing deleted)
  - Audit trail preserved

- [ ] **Create Query Activity (One-Way Push)** — Deploy query to MCE as Query Activity. `M`
  - One-click push to single MCE target
  - Create associated target DE
  - "Fire and forget" — no ongoing sync relationship
  - Checklist: 5 (Authorization), 6 (CSRF), 9 (Input validation)

#### Pro Post-Launch Features (Customer Signal)

- [ ] **Sample Value Hover** — Quick field value lookup via API call. `S`
  - Hover over field, click to fetch sample non-null value from DE
  - Helps users remember what values exist in a field

- [ ] **Smart Fix-It** — Auto-fix lint errors with one click. `M`
  - Transform LIMIT → TOP
  - Fix common MCE SQL dialect mistakes
  - Suggest corrections inline in editor

- [ ] **Personal Query Snippets** — Save/reuse SQL patterns (private to user). `M`
  - CRUD for personal snippets
  - Insert snippet into editor
  - Not shared with team (workspace snippets are Enterprise)
  - Checklist: 5 (Access control), 9 (Input validation)

- [ ] **Multiple Editor Tabs** — Work on several queries simultaneously. `M`
  - Tab management UI
  - Unsaved changes indicators
  - Tab persistence across sessions

- [ ] **Performance Linting** — Warn on known slow query patterns. `L`
  > See: `docs/epics/query-performance-analyzer.md`
  - Detect non-SARGable patterns, large Data View joins
  - Timeout risk warnings (30-minute limit)
  - No actual performance data from MCE (not exposed)

- [ ] **Pre-Flight Query Validation** — Detect PK conflicts and nullability violations before saving to Target DEs. `M`
  - Schema validation against target DE structure
  - PK conflict detection
  - Nullability warnings

### Enterprise Tier Features (Post-Launch / Customer Signal Required)

**Note:** Enterprise is deferred until Pro customers request governance features. Build when you have paying Pro customers asking for QA→Prod workflows, team collaboration, or audit requirements.

Features for global brands and agencies with team collaboration needs. Value prop: "Governed promotion + collaboration."

#### Version Control & Promotion
> See: `docs/brainstorming/version-control/2026-01-10-query-version-control-mvp-promotion-and-governance-brainstorm.md`

- [ ] **Deploy Targets (QA + Prod)** — Distinct environments with own Query Activity + DE. `L`
  - Each target has its own linked MCE artifacts
  - Both exist concurrently (not renamed/swapped)
  - UI shows: "QA pinned to vX", "Prod pinned to vY"
  - Last publish metadata (timestamp + actor)

- [ ] **Promotion Flow (QA → Prod)** — Governed promotion with diff and reason. `M`
  - Choose version to promote (default: QA pinned version)
  - Show diff versus currently pinned Prod version
  - Require "Reason" for any Prod change
  - Publish + verify (re-read remote to confirm)
  - Checklist: 5 (Authorization), 12 (Audit logging)

- [ ] **Drift Detection + Resolution** — Block publish until drift resolved. `M`
  - Sync statuses: In sync / Q++ ahead / MCE ahead / Diverged
  - If MCE edited outside Q++, block publish
  - Resolution: Overwrite (push Q++) / Pull (bring MCE into Q++) / Cancel
  - Pull creates new version + updates target pin
  - Checklist: 12 (Audit logging)

- [ ] **Selective Import** — Bring existing MCE Query Activities under Q++ management. `M`
  - Guided import flow (filterable by BU, folder, last-modified, name)
  - Strong framing: "Bring specific activities under management"
  - Avoid bloat from "import everything"

#### Collaboration & Organization

- [ ] **Shared Team Snippets** — Workspace-scoped reusable patterns. `M`
  - Extend snippets with `workspace_id`
  - Visibility levels: private, workspace, tenant
  - Snippet permissions (view, edit, delete)
  - Checklist: 5 (Broken access control), 12 (Audit logging)

- [ ] **Environment Variables** — DE prefixes, date formats per environment. `M`
  - Define variables per Deploy Target (QA/Prod)
  - Variable substitution at publish time
  - Examples: `{{DE_PREFIX}}`, `{{DATE_FORMAT}}`

- [ ] **Dependency Mapping** — Show where queries exist in automations. `L`
  - Link queries to Automation Studio automations
  - Show "blast radius" of changes
  - Read-only initially (no automation editing)

#### Governance & Compliance

- [ ] **RBAC for Deploy Permissions** — Control who can publish to Prod. `M`
  - Layer Q++ permissions on top of MCE permissions
  - Stricter-than-MCE controls for Prod publish
  - Effective permission = Q++ policy AND MCE permission
  - Checklist: 5 (Broken access control)

- [ ] **Audit Logs (Viewer + Export)** — Who did what, when, why. `M`
  - Filterable log viewer (by user, action, date range)
  - CSV/JSON export capability
  - Logs captured for all tiers; viewing is Enterprise-only
  - Checklist: 12 (Audit logging)

- [ ] **Advanced Audit & Compliance** — Enhanced audit for regulated industries. `M`
  - Log streaming to external SIEM (Datadog, Splunk)
  - Extended retention (1-2 years)
  - Compliance report generation
  - Checklist: 12 (Audit logging + monitoring), 13 (Enterprise security policies)

#### Future Enterprise (Speculative / Strong Signal Needed)

- [ ] **System Data View Scenario Builder** — Pre-built join templates for complex Data View queries. `M`
  - Journey/Click/Open flow templates
  - Subscriber/Send relationship templates
  - Template customization and saving

- [ ] **Multi-BU Bulk Deployment** — Deploy Query Activities and DEs across multiple Business Units. `L`
  - BU selection interface
  - SOAP-based batch deployment
  - Deployment status tracking
  - Shared folder support for cross-BU DEs
  - Checklist: 5 (Authorization), 6 (CSRF on state-changing operations), 9 (Outbound request safety)

- [ ] **Branching + Fork** — Safe experimentation with branch-to-query promotion. `L`
  - Internal to Q++ (branches don't create MCE activities)
  - Fork branch into new Managed Query with provenance
  - Deferred until customer signal indicates need

---

## Pre-Launch: Security Hardening & Compliance

Final hardening and compliance work before AppExchange submission. This starts after Phases 1–3 are complete and the initial feature set is stable (goal: everything in this roadmap is complete before security review).

### Security Hardening

- [ ] **Secrets Management** — Migrate from environment variables to managed secrets. `M`
  - Key store integration (AWS Secrets Manager, HashiCorp Vault, or similar)
  - Secret rotation capabilities
  - Audit trail for secret access
  - Checklist: 4 (Host and platform security), 8 (Encryption key management), 11 (Infrastructure security)

- [ ] **HTTP Security Headers** — Implement strict browser security policies. `S`
  - Content Security Policy (CSP)
  - HSTS, X-Frame-Options, X-Content-Type-Options
  - CORS configuration review
  - Checklist: 10 (HTTP security headers), 7 (Iframe embedding / frame-ancestors)

- [ ] **Rate Limiting & DDoS Protection** — Protect API from abuse. `S`
  - Per-user and per-tenant rate limits
  - Unauthenticated endpoint protection
  - Integration with CDN/WAF if needed
  - Checklist: 9 (Rate limiting), 11 (WAF/DDoS)

- [ ] **Support/Admin Access Controls** — Audited, least-privilege cross-tenant support path. `M`
  - Break-glass access for support
  - Full audit trail of support access
  - Time-limited access tokens
  - Checklist: 5 (Broken access control), 12 (Audit logging), 13 (Enterprise controls)

### AppExchange Security Review Prep

- [ ] **Security Documentation** — Prepare required security documentation. `M`
  - Security whitepaper
  - Data flow diagrams
  - Incident response plan
  - Privacy policy and DPA
  - Checklist: 2 (Required documentation), 8 (Privacy), 12 (Incident response)

- [ ] **Security Scanning Pack (SAST/DAST/Deps/TLS/Headers) + SBOM** — Produce required scan artifacts and remediation tracking for submission. `M`
  - SAST report + remediation notes (and false-positive dossier where applicable)
  - Authenticated DAST report (ZAP/Burp) + remediation notes
  - Dependency audit (pnpm audit/Snyk) results + risk acceptance docs if needed
  - TLS/headers evidence (SSL Labs + securityheaders.com), plus SBOM (CycloneDX/SPDX recommended)
  - Checklist: 3 (Security scanning requirements), 1 (Dependency CVE verification), 2 (SBOM)

- [ ] **Penetration Testing** — Third-party security assessment. `M`
  - Engage pen testing vendor
  - Remediate findings
  - Document results for AppExchange review
  - Checklist: 3 (DAST/pentest evidence), 5 (OWASP coverage validation)

- [ ] **AppExchange Security Review Submission** — Complete Salesforce security review. `L`
  - Submit application for review
  - Address reviewer feedback
  - Obtain security approval
  - Checklist: 1 (Pre-submission preparation), 2 (Required documentation), 3 (Scan artifacts)

### Production Infrastructure

- [ ] **Production Environment Setup** — Production-ready infrastructure. `M`
  - Database with SSL, backups, point-in-time recovery
  - Redis with TLS
  - CDN configuration
  - Monitoring and alerting
  - Checklist: 11 (Infrastructure security), 4 (Host and platform security), 12 (Monitoring)

- [ ] **Disaster Recovery & Backup** — Business continuity planning. `M`
  - Automated backup verification
  - Recovery runbooks
  - RTO/RPO documentation
  - Checklist: 12 (Disaster recovery)

---

## Notes

- **Launch Slice is law:** Only items in the Launch Slice section block v1.0. Everything else is post-launch.
- **Build order:** Launch Slice first, then Phase 1 remainders, then Phase 2/3 based on customer signal.
- **Feature flags:** All tier-specific features gated via `FeatureKey` system in `packages/shared-types/src/features.ts`.
- **Audit logging:** Infrastructure in Phase 1; viewer UI is Enterprise (post-launch). Logs captured for all tiers.
- **SQL guardrails:** All SQL linting/autocomplete behavior must align with `apps/web/src/features/editor-workspace/utils/sql-lint/MCE-SQL-REFERENCE.md`.
- **Tier philosophy:** Core solves daily pain points with usage caps. Pro removes caps + adds persistence. Enterprise adds governance (post-launch).
- **Usage caps rationale:** Based on [First Page Sage benchmarks](https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/), B2B freemium converts at 3-10%. Caps create upgrade pressure without punishing users.
- **Version control model:** Append-only history (Pro), Deploy Targets with promotion flow (Enterprise post-launch). See `docs/brainstorming/version-control/` for design details.
- **Licensing model:** AppExchange org-level licensing (per-seat or per-org). Individual users cannot upgrade independently within a client org; the org admin controls seat assignment.
- **MVP strategy:** Ship Core + Pro for v1.0. Defer Enterprise until Pro customers request governance features. Validate before building.
- **Audit references:** See `docs/audits/01-10-2026-roadmap/` for the 8-audit synthesis that informed this restructure.
