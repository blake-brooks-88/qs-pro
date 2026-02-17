# Project State: Query++

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-20)

**Core value:** Reduce context switching for MCE query development — write, run, save, deploy without leaving App Switcher.
**Current focus:** Phase 12 Security Baseline — Plan 01 COMPLETE (session timeouts, regeneration, audit hook). Plans 02 (CSRF) and 03 (CORS/headers) pending.

## Current Milestone

**Milestone:** v1.0 Launch (Full Phase 1)
**Status:** Ready to plan
**Progress:** [██████████] 97%

## Phase Status

| Phase | Name | Status | Plans | Progress |
|-------|------|--------|-------|----------|
| 1 | Backend Consolidation | ✓ Complete | 3/3 | 100% |
| 1.1 | Logging Standardization | ✓ Complete | 1/1 | 100% |
| 1.2 | Sensitive Data Encryption at Rest | ✓ Complete | 3/3 | 100% |
| 1.3 | Test Infrastructure Cleanup | ✓ Complete | 4/4 | 100% |
| 1.4 | Test Quality Improvements | ✓ Complete | 3/3 | 100% |
| 1.5 | Complete Test Audit Findings | ✓ Complete | 10/10 | 100% |
| 1.6 | Close Deferred Test Gaps | ✓ Complete | 15/15 | 100% |
| 1.7 | Performance Analysis | ✓ Complete | 8/8 | 100% |
| 2 | Saved Queries & History | ✓ Complete | 7/7 | 100% |
| 3 | Target DE Wizard & Deployment | ✓ Complete | — | 100% |
| 3.1 | Target DE Creation Integration | ✓ Complete | 2/2 | 100% |
| 4 | Snippet Library | ⏸ Deprioritized | 0/0 | 0% |
| 5 | Usage Quotas & Tier Enforcement | ✓ Complete | 3/3 | 100% |
| 6 | Query Execution History | ✓ Complete | 6/6 | 100% |
| 7 | Query Version History | ✓ Complete | 5/5 | 100% |
| 8 | Query Activity Deployment | ○ Pending | 0/0 | 0% |
| 8.1 | Link (INSERTED) | ✓ Complete | 7/7 | 100% |
| 8.2 | Publish (INSERTED) | ✓ Complete | 10/10 | 100% |
| 8.3 | Import & Import-then-Link (INSERTED) | ✓ Complete | 3/3 | 100% |
| 8.4 | Unlink (INSERTED) | ✓ Complete | 6/6 | 100% |
| 8.5 | Blast Radius (INSERTED) | ✓ Complete | 4/4 | 100% |
| 8.6 | Version + Publish Integration (INSERTED) | ✓ Complete | 5/5 | 100% |
| 9 | Audit Logging Infrastructure | ✓ Complete | 6/6 | 100% |
| 10 | Observability & Monitoring | ✓ Complete | 5/5 | 100% |
| 11 | API Hardening | ✓ Complete | 3/3 | 100% |
| 12 | Security Baseline | ◐ In Progress | 1/3 | 33% |
| 13 | Monetization | ○ Pending | 0/0 | 0% |
| 14 | RBAC & Admit Controls | ○ Pending | 0/0 | 0% |
| 15 | GDPR & Data Lifecycle | ○ Pending | 0/0 | 0% |
| 16 | AppExchange Security Review | ○ Pending | 0/0 | 0% |

## Phase 1 Completion Summary

**Reference:** `docs/plans/2026-01-18-backend-consolidation-refactoring.md`
**Verification:** 12/12 must-haves verified

| Section | Description | Status |
|---------|-------------|--------|
| 1 | MCE SOAP Centralization | ✅ Complete (PR #9) |
| 2 | MCE API Consolidation | ✅ Complete (PR #11) |
| 3 | AuthService Consolidation | ✅ Complete (PR #10) |
| 4 | Database Layer Consolidation | ✅ Complete |
| 5 | Error Handling Utilities | ✅ Complete (PR #19) |
| 6 | Configuration Validation | ✅ Complete (Plans 01-01, 01-02) |
| 7 | Logging Standardization | ✅ Complete (Phase 1.1) |
| 8 | Session Guard Consolidation | ✅ Complete (Plan 01-03) |
| 9 | MceBridgeService Consolidation | ✅ Complete |

**Key Deliverables:**
- Zod-based environment validation schemas (base, API, worker)
- Cross-field cookie validation (SameSite/Secure, Partitioned/Domain)
- Type-safe ConfigService access with { infer: true }
- Consolidated SessionGuard with strict type checks
- Shared LoggerModule with Pino (replaced RequestLoggerMiddleware and JsonLogger)
- Zero code duplication between apps/api and packages/backend-shared

## Requirement Coverage

**Total v1 Requirements:** 55
**Completed:** 0
**In Progress:** 0
**Pending:** 55

## Key Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-23 | Type suffix naming convention (.unit.test.ts, etc.) | Enables Vitest filtering by test type and aligns with industry standards |
| 2026-01-23 | mergeConfig pattern for Vitest configs | Per-package configs extend shared base while preserving package-specific settings |
| 2026-01-23 | workspace projects in root vitest.config | Enables coverage aggregation across packages |
| 2026-01-23 | project names per package (api, web, worker, etc.) | Supports --project filtering by package |
| 2026-01-23 | Counter-based unique IDs for test factories | Predictable, readable test output for debugging |
| 2026-01-23 | vitest as peerDependency in test-utils | Consumer apps control vitest version |
| 2026-01-23 | Import from @qpp/test-utils in all tests | Single source of truth for factories/stubs |
| 2026-01-23 | resetFactories() in beforeEach | Ensures unique IDs and test isolation |
| 2026-01-23 | Encrypt errorMessage inside updateStatus() | Centralizes encryption for all callers (markFailed, onFailed) |
| 2026-01-23 | Null-coalesce decrypt result to undefined | TypeScript type safety for API error objects |
| 2026-01-22 | EncryptionModule is @Global() | Available throughout app without explicit imports, follows LoggerModule pattern |
| 2026-01-22 | Null/empty passthrough in EncryptionService | Prevents encrypting empty values, simplifies consumer code |
| 2026-01-22 | Key retrieval per operation (not cached) | Supports key rotation, consistent with security best practices |
| 2026-01-22 | Use Pino + nestjs-pino for structured logging | Industry standard, AsyncLocalStorage auto-binding, better performance than Winston |
| 2026-01-22 | Global LoggerModule with forRootAsync | ConfigService integration for environment-aware configuration |
| 2026-01-22 | Sensitive data redaction via pino redact | Masks authorization, cookie, password, token, secret, sessionSecret in logs |
| 2026-01-22 | Auto-skip health/metrics from request logging | Reduces log noise from health checks |
| 2026-01-21 | Use ConfigService.get({ infer: true }) for type safety | Zod validation provides strong typing via inference |
| 2026-01-21 | Set test env vars in vitest.config.ts | Integration tests need valid env vars for Zod validation |
| 2026-01-21 | Used stricter SessionGuard as canonical (typeof checks) | Prevents non-string session values from passing |
| 2026-01-21 | All env schemas in backend-shared (not per-app) | Single source of truth for all env requirements |
| 2026-01-21 | Use Zod .transform() for boolean env vars | Centralized conversion logic, type-safe |
| 2026-01-21 | Cross-field validation in schemas via .refine() | Fail-fast at startup with clear error messages |
| 2026-01-20 | Full Phase 1 scope for milestone | User wants comprehensive coverage including infrastructure |
| 2026-01-20 | 13-phase structure | Comprehensive depth setting (8-12 phases) + Phase 1 inserted |
| 2026-01-20 | Wave-based parallelization | Maximize execution efficiency with dependency awareness |
| 2026-01-20 | Backend Consolidation inserted as Phase 1 | Complete tech debt cleanup before feature work |
| 2026-01-22 | Phase 1.1 inserted for Logging Standardization | Section 7 was only partially complete (middleware consolidated, but JsonLogger still in worker only) |
| 2026-01-23 | 5 error-level vitest rules for CI blocking | expect-expect, no-conditional-expect, no-focused-tests, no-identical-title, no-duplicate-hooks must be fixed |
| 2026-01-23 | 5 warn-level vitest rules for gradual improvement | no-disabled-tests, prefer-hooks-*, prefer-to-* tracked but don't block CI |
| 2026-01-23 | eslint-disable-next-line for intentional conditional expects | Spike tests and error verification patterns legitimately need conditional expects |
| 2026-01-23 | nyc for coverage merging | Vitest workspace projects don't isolate test matching; per-package coverage + nyc merge is more reliable |
| 2026-01-23 | Shell script for coverage (test-coverage.sh) | pnpm -r doesn't forward --coverage; direct vitest from root causes cross-package contamination |
| 2026-01-23 | Artifact-based coverage sharing | vitest-coverage-report-action needs coverage files; artifact pattern allows independent coverage job |
| 2026-01-24 | vi.resetAllMocks() over vi.clearAllMocks() | clearAllMocks only clears call history, resetAllMocks also resets mockImplementation - essential when tests use mockImplementation |
| 2026-01-24 | Behavioral assertions pattern | BEFORE: expect(mockRepo.method).toHaveBeenCalledWith(...) AFTER: expect(result).toEqual(...) - tests survive internal refactoring |
| 2026-01-24 | getDataExtensions lacks caching | Discovered during behavioral refactoring - original mock test masked missing feature |
| 2026-01-24 | Stub MceAuthProvider pattern | MSW handles HTTP interception; no need to mock auth flow |
| 2026-01-24 | SOAP response builders for tests | Functions generate controlled SOAP XML responses for different test scenarios |
| 2026-01-24 | Date.now mock instead of vi.useFakeTimers() | Fake timers block HTTP stack async operations; Date.now mock allows HTTP while controlling time validation |
| 2026-01-24 | MSW request counter for concurrency tests | Deterministic verification of deduplication without timing races |
| 2026-01-24 | MSW for SOAP boundary testing | Test sweeper behavior at the MCE SOAP boundary without internal mocks |
| 2026-01-24 | Folder ID-based request isolation | Use unique folder IDs (999001, 999002) to isolate test tenant requests from existing database data |
| 2026-01-24 | RLS context helpers for credentials | Created insertCredentials/deleteCredentials helpers that properly set RLS context |
| 2026-01-24 | detectRequestType without < prefix | Use includes('DeleteRequest') instead of includes('<DeleteRequest>') to handle namespace prefixes in SOAP requests |
| 2026-01-24 | Stub Redis for SSE event verification | Track published events in stub rather than real Redis pub/sub for test verification |
| 2026-01-24 | Decrypt helper for SSE payloads | Created getDecryptedEvents() helper to decrypt and parse encrypted SSE messages |
| 2026-01-24 | SSE HTTP tests focus on error cases | SSE streaming via app.inject() is problematic; unit tests handle Observable, HTTP tests handle 404/429 |
| 2026-01-24 | CsrfGuard override for POST tests | Controllers use both SessionGuard and CsrfGuard; POST tests must override both |
| 2026-01-24 | res.send() to bypass @Redirect() | @Redirect() decorator intercepts return values; use res.send() directly for JSON responses |
| 2026-01-24 | Error tests verify retry behavior | useRunResults has retry:3; tests wait for all retries and verify count=4 rather than overriding |
| 2026-01-24 | System data view bypass verification | getFields() tests verify local data returned for system views without API call |
| 2026-01-25 | Worker simulation via mocked self.postMessage | jsdom doesn't support Web Workers; mocking self.postMessage allows testing message handling logic |
| 2026-01-25 | Monaco mock via captured onMount | Monaco Editor operates with complex browser APIs; mock @monaco-editor/react to capture onMount callback for testing behaviors |
| 2026-01-26 | MCE HTTP timeout values | 30s for metadata/queue/poll operations, 120s for data retrieval; reuse MCE_SERVER_ERROR for timeouts |
| 2026-01-26 | Timeout parameter optional | MceHttpClient.request() timeout defaults to MCE_TIMEOUTS.DEFAULT for backward compatibility |
| 2026-01-27 | Transaction-scoped RLS context | Use set_config(..., true) within BEGIN/COMMIT instead of session-scoped set_config(..., false) |
| 2026-01-27 | No RESET needed with SET LOCAL | COMMIT/ROLLBACK automatically clears transaction-local settings |
| 2026-01-27 | Query Activity keyed by userId | Query Activities reused per user (matching Query Studio's InteractiveQuery pattern); reduces MCE API calls |
| 2026-01-27 | withRetry wraps entire request flow | Retry wrapper includes auth retry logic inside; transient errors (429/5xx) trigger withRetry while auth (401) triggers internal refresh |
| 2026-01-27 | 5xx errors now retryable via withRetry | With withRetry integration, 5xx errors retry up to 3 times with exponential backoff (not terminal) |
| 2026-01-29 | Self-referential parent_id FK via AnyPgColumn | Drizzle requires AnyPgColumn type for self-referencing table columns |
| 2026-01-29 | drizzle-kit generate --custom for RLS migrations | Generates proper journal entry without manual editing |
| 2026-01-30 | Repository getDbFromContext() pattern | Use getDbFromContext() for RLS-aware connection in repositories |
| 2026-01-30 | hasChildren checks folders AND queries | DrizzleFoldersRepository.hasChildren checks both child folders and saved_queries |
| 2026-01-30 | Controller Zod safeParse validation | Validate request bodies with safeParse and throw BadRequestException |
| 2026-01-30 | SQL text encrypted at rest | SavedQueriesService encrypts sqlText before database write, decrypts on read |
| 2026-01-30 | Integration test RLS cleanup order | Delete saved_queries/folders with RLS context before deleting users to avoid FK violations |
| 2026-01-30 | originalContent field for dirty detection | Store original content when tab opens, compare with current to determine dirty state |
| 2026-01-30 | Tab ID prefixes (query-/untitled-) | Easy identification and duplicate prevention for tabs |
| 2026-01-30 | server.use() for per-test MSW handlers | Use global MSW server with per-test handler overrides |
| 2026-01-30 | Global MSW handlers for API endpoints | Add /api/folders and /api/saved-queries to global handlers since QueryTreeView fetches from API |
| 2026-01-30 | Zustand sync pattern for EditorWorkspace | Sync EditorWorkspace internal state with Zustand store; full migration deferred |
| 2026-01-30 | @dnd-kit for drag-and-drop tabs | Best React 18 support, accessibility built-in, vertical list strategy |
| 2026-01-30 | Derive tier from feature flags | /features API only returns flags, not tier; infer from advancedAutocomplete (Pro) or deployToAutomation (Enterprise) |
| 2026-01-30 | Folders locked for free tier | Per plan requirements; folders are Pro-only feature |
| 2026-01-30 | Auto-save via API mutation | Existing queries update via PATCH /api/saved-queries/:id with toast feedback |
| 2026-01-30 | SaveQueryModal uses internal hooks | Modal fetches folders/count internally instead of receiving via props |
| 2026-02-04 | Phase 3 implemented without formal planning | Query Activity deployment and Run to Target implemented directly, verified post-hoc |
| 2026-02-04 | Phase 3.1 inserted for DE creation gap | TargetDataExtensionModal only supports selection; creation integration deferred |
| 2026-02-06 | Phase 4 deprioritized | Snippet Library kept in roadmap but skipped — not on critical path for launch or monetization; proceed to Phase 5 after 3.1 |
| 2026-02-07 | Local UsageResponse type in use-run-usage.ts | Plan 01/02 are Wave 1 (parallel); shared-types may not have the type yet; local definition is identical |
| 2026-02-07 | 30s staleTime for useRunUsage | Balances freshness vs API load; cache invalidation after run creation handled by Plan 03 |
| 2026-02-07 | Session-scoped banner dismissal (no persist) | Per CONTEXT.md: warning banner resets on page reload; default Zustand behavior |
| 2026-02-07 | QUOTA_EXCEEDED maps to HTTP 429 | Quota exhaustion is semantically equivalent to rate limiting |
| 2026-02-07 | QUOTA_EXCEEDED classified as terminal | Retrying won't help -- user must wait or upgrade |
| 2026-02-07 | UsageModule provides own SHELL_QUERY_RUN_REPOSITORY | Follows ShellQueryModule factory pattern, avoids circular dependency |
| 2026-02-07 | Single getTenantFeatures call in createRun | Refactored to avoid redundant MCE features lookup |
| 2026-02-07 | @solar-icons/react for DataTable sort/pagination icons | Matches project icon library; uses AltArrowUp/Down, SortVertical, DoubleAltArrow* |
| 2026-02-07 | @tanstack/react-table for DataTable | Industry standard headless table; supports server-side pagination/sorting |
| 2026-02-07 | Activity Bar pattern for sidebar navigation | VS Code-style icon strip replaces internal tab switcher; enables scalable view management |
| 2026-02-07 | ClockCircle icon for Execution History | Consistent with @solar-icons/react library; clear semantic meaning |
| 2026-02-07 | Zero-overhead SQL persistence in createRun | Encrypt once, reuse for both BullMQ and DB column |
| 2026-02-07 | checkRowsetReady returns { ready, rowCount } | Extract row count from existing getRowset response without extra API call |
| 2026-02-07 | Sort by completedAt as proxy for durationMs | Duration is computed; completedAt is the stored column |
| 2026-02-07 | Dynamic WHERE conditions array pattern | Build conditions[], spread into and() for flexible Drizzle filtering |
| 2026-02-07 | Server-side search excludes encrypted SQL | Cannot ILIKE on encrypted columns; search matches snippetName and targetDeCustomerKey only |
| 2026-02-07 | Map for STATUS_LABEL in HistoryPanel | Satisfies security/detect-object-injection lint rule; Map.get() is safe |
| 2026-02-07 | HistoryPanel fills full sidebar height | Separate layout branch from DE/Queries tree content to maximize table space |
| 2026-02-07 | Sidebar search and footer hidden for history view | HistoryPanel has own search; footer usage badge unnecessary in history context |
| 2026-02-07 | DocumentAdd icon for "Open in new tab" | @solar-icons/react notes category; TabDocumentAdd does not exist |
| 2026-02-07 | Map for VIEW_TITLES in WorkspaceSidebar | Satisfies security/detect-object-injection lint rule; Map.get() is safe |
| 2026-02-07 | clearHistoryFilter imported directly in HistoryPanel | Encapsulation; HistoryPanel owns its relationship with the store |
| 2026-02-07 | savedQueryId as 5th positional arg to execute() | Avoids breaking existing callers; undefined for unsaved queries |
| 2026-02-08 | Custom migrations via drizzle-kit --custom | Interactive TUI blocked automated schema generation; custom entries provide proper journal tracking |
| 2026-02-08 | sqlTextHash for rapid-save dedup | SHA-256 hash enables dedup without decrypting SQL |
| 2026-02-08 | lineCount precomputed at write time | Avoids decryption overhead for timeline display |
| 2026-02-08 | No versionNumber column | CONTEXT.md explicitly says timestamps only |
| 2026-02-08 | VersionListItem excludes SQL text | Timeline display should not require decryption of every version |
| 2026-02-08 | QueryVersionsModule provides own SAVED_QUERIES_REPOSITORY | Avoids circular dependency with SavedQueriesModule; follows UsageModule pattern |
| 2026-02-08 | assertFeatureEnabled pattern for service-level gating | Throws FEATURE_NOT_ENABLED before any version operation for free tier |
| 2026-02-08 | Restore creates new version with source:'restore' | Append-only design; restoredFromId maintains full audit trail |
| 2026-02-08 | Version creation on update() only when hash differs | SHA-256 dedup prevents duplicate versions from rapid Ctrl+S saves |
| 2026-02-08 | Infinity staleTime for useVersionDetail | Version content is immutable (append-only), no need to refetch |
| 2026-02-08 | Client-side line count delta | Sorted array makes delta trivial: versions[i].lineCount - versions[i+1].lineCount |
| 2026-02-08 | Local state for VersionHistoryPanel selection | Panel is self-contained; Zustand store used by EditorWorkspace for open/close coordination only |
| 2026-02-08 | Auto-select newest version on panel open | Prevents empty diff viewer; matches Google Docs behavior |
| 2026-02-08 | useMemo wrapper for versions array | Prevents unstable dependency in react-hooks/exhaustive-deps |
| 2026-02-08 | ConfirmationDialog variant=info for restore | Restore is non-destructive (creates new version); info variant appropriate |
| 2026-02-08 | History icon for Version History button | Distinct from ClockCircle used for Run History; both from @solar-icons/react |
| 2026-02-08 | Three-button unsaved changes dialog | Dialog primitives used directly instead of extending ConfirmationDialog; three actions needed (Save & Continue / Continue Without Saving / Cancel) |
| 2026-02-08 | Editor takeover mode for version history | VersionHistoryPanel replaces editor+results in same workspace div; preserves sidebar visibility |
| 2026-02-09 | Partial unique index for QA linking | (tenant_id, mid, linked_qa_customer_key) WHERE NOT NULL prevents race conditions at DB level |
| 2026-02-09 | query_versions RLS broadened to tenant+mid | Team visibility for version history when queries are linked/deployed |
| 2026-02-09 | Fixed stale drizzle snapshots (0014-0016) | Custom migrations left snapshots out of sync; fixed before generating new migration |
| 2026-02-09 | CsrfGuard moved to method-level on query-activities controller | GET endpoints should not require CSRF; POST/DELETE get explicit CsrfGuard |
| 2026-02-09 | findAllLinkedQaKeys uses tenant-context RLS | Cross-user visibility needed for duplicate link protection at BU scope |
| 2026-02-09 | Link/unlink endpoints on query-activities controller | POST/DELETE /query-activities/link/:savedQueryId keeps QA operations together |
| 2026-02-09 | queryActivityKeys factory for cache management | Shared between list/detail hooks and mutation hooks for consistent invalidation |
| 2026-02-09 | Guard check pattern over non-null assertion in hooks | Matches useSavedQuery pattern; satisfies ESLint no-non-null-assertion rule |
| 2026-02-09 | Optional link fields on Tab interface | Existing tabs have no link state; optional prevents breaking existing creation paths |
| 2026-02-09 | LinkMinimalistic icon for LinkedBadge | Clean link icon from @solar-icons/react; avoids cloud/rocket aesthetic per CONTEXT.md |
| 2026-02-09 | Side-by-side DiffEditor in LinkConflictDialog | Clearer visual comparison with labeled panes; max-w-3xl provides enough horizontal space |
| 2026-02-09 | Direct API call for QA detail in LinkQueryModal | Imperative one-shot fetch triggered by click; avoids unnecessary cache pollution |
| 2026-02-09 | Feature-gate via useFeature hook in EditorWorkspace | Toolbar link button/status needs conditional rendering; boolean flag cleaner than FeatureGate wrapper |
| 2026-02-09 | onLinkQuery presence controls context menu visibility | Caller decides feature gating; QueryTreeView stays agnostic to tier/feature logic |
| 2026-02-09 | Auto-link failure after deploy is non-fatal | Deploy succeeded even if link fails; user still gets the QA created |
| 2026-02-09 | Broadened saved_queries RLS from per-user to per-BU | findAllLinkedQaKeys uses tenant context (no user_id); old policy caused empty results. Migration 0019 aligns with MEMORY.md note |
| 2026-02-11 | query_publish_events uses tenant+mid RLS (not per-user) | Publish events visible to all BU members; matches broadened pattern from Phase 8.1 |
| 2026-02-11 | CASCADE delete on publish event FKs | Deleting saved_query or version automatically cleans up publish annotations |
| 2026-02-11 | Annotation model for publishing | Publishing tags existing versions via query_publish_events, does NOT create new versions |
| 2026-02-11 | Manual-trigger hook for drift check | useDriftCheck uses enabled: false + staleTime: 0 for on-demand fetches; drift should never be cached |
| 2026-02-11 | Editor fallback for first publish | PublishConfirmationDialog uses read-only Editor (not DiffEditor) when currentAsSql is null |
| 2026-02-11 | HIGH_RISK_STATUSES Set for blast radius | Running, Scheduled, Awaiting Trigger highlighted with amber in automation list |
| 2026-02-11 | Export icon for Publish button | Conveys push-outward without cloud/rocket; from @solar-icons/react arrows-action |
| 2026-02-11 | Toast for must-save-first guard | toast.warning() from sonner; simpler UX than modal dialog |
| 2026-02-11 | Drift-on-open via ref Set tracking | useRef<Set<string>> tracks checked tab IDs; prevents re-check on re-render |
| 2026-02-11 | Create vs Publish terminology | "Create in AS" = new QA creation, "Publish" = push SQL to existing linked QA |
| 2026-02-11 | vi.hoisted() for vi.mock mutable state | Vitest hoists vi.mock to top of file; vi.hoisted() creates variables before hoisting runs |
| 2026-02-11 | Refetch return value for enabled:false hooks | TanStack Query v5 with enabled:false doesn't update hook state on refetch; assert on return value |
| 2026-02-11 | Separate EditorWorkspace-publish test file | Isolated from 1100-line EditorWorkspace.test.tsx for context isolation and maintainability |
| 2026-02-11 | Post-render updateTabLinkState for linked tabs | EditorWorkspace init effect calls storeOpenQuery without linkState; set via updateTabLinkState after render |
| 2026-02-11 | Imported queries are UNLINKED | No linkedQaCustomerKey/linkedQaName set when importing a QA as saved query; explicit CONTEXT.md decision |
| 2026-02-11 | Import button outside queryId conditional | Import from AS works from any tab including untitled; unlike Link/Publish which require saved queries |
| 2026-02-11 | Import icon from solar-icons arrows-action | Import icon from @solar-icons/react used for toolbar button |
| 2026-02-11 | Radix Tooltip mock for EditorWorkspace integration tests | Render tooltip content inline to make toolbar labels queryable; findImportButton helper navigates DOM siblings |
| 2026-02-11 | Tab store assertions for import outcomes | Verify import created correct tabs via useTabsStore.getState().tabs rather than weaker callback-only checks |
| 2026-02-11 | INVALID_STATE for deleteRemote without linked QA | Explicit error code when user requests remote QA deletion but saved query has no linked QA |
| 2026-02-11 | Safe unlink ordering: capture -> unlink -> delete remote -> delete local | If SOAP deletion fails after unlink, user still has clean unlink state |
| 2026-02-11 | Controller falls back to unlink-only on body parse failure | No BadRequestException for backwards compat; old clients sending no body must continue working |
| 2026-02-11 | Outer .default() on UnlinkRequestSchema | undefined input (no body) parses to { deleteLocal: false, deleteRemote: false } automatically |
| 2026-02-12 | button[role=radio] for card-style radio options | jsx-a11y/label-has-associated-control rejects label wrapping input in card pattern; button with role=radio bypasses while maintaining accessibility |
| 2026-02-12 | Single unlinkTarget state for both entry points | Toolbar and context menu both set the same { savedQueryId, savedQueryName, linkedQaName, linkedQaCustomerKey } state to drive UnlinkModal |
| 2026-02-12 | Lazy blast radius fetch in UnlinkModal | Blast radius only queried when user selects delete-remote or delete-both; not on modal open |
| 2026-02-12 | LinkBrokenMinimalistic icon for Unlink button | @solar-icons/react text-formatting category; visually communicates disconnect intent |
| 2026-02-12 | Exact case-sensitive type-to-confirm | No trim, no toLowerCase on type-to-confirm input; maximum safety for destructive operations |
| 2026-02-12 | MSW request spy for DELETE body verification | vi.fn() inside MSW handler captures request.json() for mutation payload assertions; avoids mocking hooks directly |
| 2026-02-12 | Mock UnlinkModal in EditorWorkspace tests | Keeps integration tests focused on wiring (button visibility, modal open, callback handling) without coupling to modal internals |
| 2026-02-12 | Radix Tooltip transparent mock for unlink tests | Same pattern as import tests; ToolbarButton labels inside Tooltip.Content need inline rendering for queryability |
| 2026-02-12 | QueryTreeView onUnlinkQuery called with queryId only | Matches actual code signature; EditorWorkspace handleOpenUnlinkModal derives other fields from store/props |
| 2026-02-12 | MCE REST API returns entry/totalResults not items/count | AutomationListResponse corrected to match actual MCE GET /automation/v1/automations response |
| 2026-02-12 | MCE AutomationItem uses status not statusId | MCE API returns numeric status field, not statusId |
| 2026-02-12 | SET NULL FK preserves execution history | shell_query_runs.savedQueryId ON DELETE SET NULL keeps run records after saved query deletion |
| 2026-02-12 | Migration drops auto-named FK, creates Drizzle-named | Original inline REFERENCES created shell_query_runs_saved_query_id_fkey; migration renames to Drizzle convention |
| 2026-02-12 | effectiveSafetyTier pattern for error fallback | Override computed safety tier at consumption site rather than modifying pure determineSafetyTier function |
| 2026-02-12 | text-destructive for blast radius error states | Visually distinct from amber warnings and muted empty states; consistent error severity signaling |
| 2026-02-12 | Toolbar useBlastRadius always-on for linked tabs | Not gated behind dialog; TanStack Query deduplicates via shared query key |
| 2026-02-12 | typeof check for optional number props | `typeof x === "number"` preferred over `x != null` to satisfy ESLint eqeqeq rule |
| 2026-02-12 | Separate error-state test files for phase ownership | UnlinkModal-error.test.tsx avoids conflicts with Phase 8.4's UnlinkModal.test.tsx |
| 2026-02-14 | audit_retention_days on tenants table (not tenant_settings) | Retention is tenant-level policy, not per-BU; simpler schema |
| 2026-02-14 | GIN index with jsonb_path_ops | Smaller index, faster containment queries; no ILIKE needed at Q++ volume |
| 2026-02-14 | No INSERT-only GRANT yet | Runtime role name unconfirmed; trigger + service restriction provide 2/3 defense layers |
| 2026-02-14 | AuditEventType as TypeScript union | Extensible without modifying schemas; runtime array for validation |
| 2026-02-14 | Composite PK (id, created_at) for partitioned table | PostgreSQL requires partition key in PK; Drizzle schema defines columns without PK (handled in SQL migration) |
| 2026-02-14 | MAX retention threshold for partition purge | MAX(COALESCE(audit_retention_days, 365)) ensures no partition dropped until ALL tenants' data expired |
| 2026-02-14 | Partition DETACH+DROP for immutable table purge | Bypasses immutability trigger; detach removes from hierarchy, DROP operates on standalone table |
| 2026-02-14 | Pre-create 2 months ahead on 25th | Monthly cron creates next 2 partitions with IF NOT EXISTS for idempotency |
| 2026-02-14 | AuditService try/catch wrapping | Audit failures must not crash requests; logged at error level but never propagated |
| 2026-02-14 | AuditInterceptor skips missing user context | Routes without SessionGuard skip audit silently (debug log) |
| 2026-02-14 | extractTargetId params -> responseData fallback | Handles both update (ID in URL) and create (ID in response) patterns |
| 2026-02-14 | APP_INTERCEPTOR global registration | Zero overhead on undecorated methods (early return before tap) |
| 2026-02-12 | MSW for error-state tests (not vi.mock) | Consistent with existing UnlinkModal.test.tsx pattern; keeps test architecture uniform |
| 2026-02-14 | FeaturesModule imported in AuditModule (not @Global) | FeaturesModule is not global; follows ShellQueryModule import pattern |
| 2026-02-14 | No separate folder.moved event type | Update PATCH handles parentId changes; folder.updated covers rename and move |
| 2026-02-14 | Auth events use explicit AuditService.log() | Login/callback lack populated user session at interceptor time; explicit calls after session.set() |
| 2026-02-14 | Logout reads session before deletion | No SessionGuard on logout; session data read directly then audit logged if present |
| 2026-02-14 | Worker sweeper direct db.insert(auditLogs) | AuditService lives in apps/api; worker uses direct INSERT inside existing RLS context |
| 2026-02-14 | auth.session_expired deferred to Phase 12 | SessionGuard in @qpp/backend-shared has no AuditService access; Phase 12 Security Baseline adds session lifecycle |
| 2026-02-14 | system.retention_purge deferred to Phase 14 | Global partition drops have no tenant context for RLS; Phase 14 RBAC introduces admin context |
| 2026-02-14 | JSONB search via ::text ILIKE (not GIN @>) | GIN jsonb_path_ops only supports containment; free-text needs text cast; acceptable at enterprise volume |
| 2026-02-14 | eventType wildcard support with LIKE | * converted to % for prefix match; exact eq() for non-wildcard |
| 2026-02-12 | Flex sibling separation for truncatable/non-truncatable badge content | Count suffix as shrink-0 sibling of truncate span prevents clipping; applies to any badge with mixed-priority content |
| 2026-02-12 | UAT gap 3 accepted: sm tooltip has no automation count | Tree view list endpoint lacks per-item counts; N+1 blast radius queries too expensive; md toolbar variant is the correct location |
| 2026-02-13 | Publish events endpoint on QueryVersionsController | Co-located with version routes rather than QueryActivitiesController; serves version timeline UI |
| 2026-02-13 | No pagination on publish events list | Dataset naturally bounded (< 50 per saved query); simpler API without cursor/offset overhead |
| 2026-02-13 | Cross-module repository injection for publish events | QueryVersionsModule registers own QUERY_PUBLISH_EVENT_REPOSITORY from query-activities module |
| 2026-02-13 | 30s staleTime for usePublishEvents | Matches version history staleness; cache invalidation handles freshness after publish |
| 2026-02-13 | derivePublishState trusts API sort order | Events pre-sorted desc by createdAt from API; events[0] is current published version |
| 2026-02-13 | publish-pulse uses rgba(0, 255, 148) | Matches --success (#00FF94) design token; same 2s ease-in-out infinite as badge-pulse |
| 2026-02-13 | Publish indicator dot at left-4 top-4 on timeline node | Positioned at bottom-right of 6x6 dot as overlay; z-10 ensures visibility above timeline line |
| 2026-02-13 | Gap counter uses warning palette (amber) | Signals unpublished work without alarm; hidden when latest version is published or no published version |
| 2026-02-13 | PublishBadge label differentiates current vs previous | "published" (current) vs "was published" (previous) with Nx suffix for multi-publish; expandable dropdown |
| 2026-02-13 | Separate test files per publish concern | VersionTimeline-publish.test.tsx (indicators/badges) and VersionHistoryPanel-publish-events.test.tsx (gap counter/wiring) isolate Phase 8.6 tests |
| 2026-02-15 | instrument.ts first-import pattern for OTel | Sentry/OpenTelemetry must initialize before any module imports for auto-instrumentation monkey-patching to work |
| 2026-02-15 | @SentryExceptionCaptured decorator (not manual captureException) | Decorator on GlobalExceptionFilter.catch() avoids duplicate error reports; decorator is additive to existing handler |
| 2026-02-15 | Separate import type for ArgumentsHost | isolatedModules + emitDecoratorMetadata requires explicit import type for types in decorated method signatures |
| 2026-02-15 | All Phase 10 deps installed in Plan 01 | Subsequent plans focus on implementation; @nestjs/terminus, prom-client, pino-loki, @sentry/react ready |
| 2026-02-15 | observabilitySchema with all-optional env vars | SENTRY_DSN, SENTRY_ENVIRONMENT, LOKI_HOST/USERNAME/PASSWORD all optional; dev environments work without config |
| 2026-02-15 | Browser instrument.ts as first import in main.tsx | Sentry must initialize before any module imports for fetch/XHR auto-instrumentation |
| 2026-02-15 | ErrorBoundary wraps only authenticated AppShell | Loading/error/unauth states are simple static content that won't crash; no need to wrap |
| 2026-02-15 | 10% trace sampling in production, 100% in dev | Errors always captured at 100% (default sampleRate); traces throttled for performance |
| 2026-02-15 | Conditional Sentry Vite plugin via process.env check | Plugin only activates when SENTRY_AUTH_TOKEN present; .filter(Boolean) removes null from plugins array |
| 2026-02-15 | Source maps deleted after Sentry upload | filesToDeleteAfterUpload prevents serving .js.map files to end users (source code protection) |
| 2026-02-15 | SENTRY_AUTH_TOKEN/ORG/PROJECT_WEB not VITE_ prefixed | Build-time env vars consumed by Vite plugin (Node.js context), not client-side runtime |
| 2026-02-16 | HealthIndicatorService (v11 pattern) over deprecated HealthIndicator | terminus v11 deprecates base class; new check(key)/up()/down() API is cleaner and forward-compatible |
| 2026-02-16 | Worker Postgres health uses SQL_CLIENT (raw postgres) | Worker lacks drizzle-orm as direct dependency; raw postgres tagged template avoids vitest resolution issues |
| 2026-02-16 | pino-loki transport activated via LOKI_HOST env var | Dev experience unchanged (pino-pretty); only enables Loki transport when explicitly configured in production |
| 2026-02-16 | BullMQ telemetry supported via @nestjs/bullmq | BullRootModuleOptions extends Bull.QueueOptions which includes telemetry?: Telemetry; BullMQOtel wired directly |
| 2026-02-16 | @Global() MetricsModule with injectable provider tokens | QPP_QUERIES_EXECUTED, QPP_MCE_API_CALLS, QPP_QUERY_DURATION available for @Inject() across API |
| 2026-02-16 | Runbooks force-added past /docs/ gitignore | Operational runbooks are hand-crafted, not auto-generated; git add -f appropriate |
| 2026-02-16 | OUTBOUND_HOST_POLICY defaults to 'log' | Safe rollout; teams switch to 'block' when confident in allowlist coverage |
| 2026-02-16 | Only full URLs validated for host policy | Relative paths (e.g., /data/v1/async) skip host validation; only http(s):// URLs checked |
| 2026-02-16 | ThrottlerModule limit 10000 in test env | Effectively disables rate limiting during rapid test execution to prevent interference |
| 2026-02-16 | @SkipThrottle() on auth, health, metrics controllers | OAuth flow is its own rate limiter; health/metrics are infrastructure endpoints |
| 2026-02-16 | SessionThrottlerGuard uses session userId for tracking | Falls back to IP for unauthenticated, then 'unknown'; extends ThrottlerGuard |
| 2026-02-16 | relkind IN ('r','p') for FORCE RLS pg_class query | audit_logs is partitioned (relkind='p'); must include both regular and partitioned tables |
| 2026-02-16 | DISABLE TRIGGER for audit_logs immutability bypass in tests | set_config('app.audit_retention_purge') unreliable in purge context; ALTER TABLE DISABLE TRIGGER is deterministic |
| 2026-02-16 | withRlsContext helper for RLS integration tests | Reserves connection, sets set_config vars, executes callback, resets in finally block |
| 2026-02-16 | @fastify/secure-session expiry for idle timeout | Library's expiry + touch() handles idle timeout via internal __ts field; no manual lastActivityAt needed |
| 2026-02-16 | request.sessionExpiredContext tagging pattern | Bridges SessionGuard (backend-shared) and AuditService (api) without circular DI |
| 2026-02-16 | createdAt stored in session cookie for absolute timeout | Sessions are cookie-based; absolute timeout via session field, not DB column |

## Roadmap Evolution

- Phase 01.1 inserted after Phase 1: Logging Standardization (URGENT) — completes Section 7 of backend consolidation plan
- Phase 01.2 inserted after Phase 01.1: Sensitive Data Encryption at Rest (URGENT) — encrypt all sensitive data at rest
- Phase 01.3 inserted after Phase 01.2: Test Infrastructure Cleanup (URGENT) — standardize test patterns and improve consistency
- Phase 01.4 inserted after Phase 01.3: Test Quality Improvements (URGENT) — improve test quality and coverage
- Phase 01.5 inserted after Phase 01.4: Complete Test Audit Findings (URGENT) — address HIGH/MEDIUM priority test quality issues from audit inventory
- Phase 01.6 inserted after Phase 01.5: Close Deferred Test Gaps (URGENT) — test behaviors deferred from 1.5 with weak justifications
- Phase 01.7 REMOVED (2026-01-26): Tenant Data Cleanup deferred to pre-AppExchange submission — data model not mature enough, would require retrofitting after each feature phase
- Phase 01.7 inserted after Phase 01.6: Performance Analysis (URGENT) — ensure build efficiency and scalability for multi-user load
- Phase 3.1 inserted after Phase 3: Target DE Creation Integration — wire DataExtensionModal into TargetDataExtensionModal for "create new" option
- Phase 4 deprioritized (2026-02-06): Snippet Library — nice-to-have, not on critical path; skip to Phase 5 after 3.1
- Phase 8.1 inserted after Phase 8: Link (URGENT)
- Phase 8.2 inserted after Phase 8.1: Publish (URGENT)
- Phase 8.3 inserted after Phase 8.2: Import & Import-then-Link (URGENT)
- Phase 8.4 inserted after Phase 8.3: Unlink (URGENT)
- Phase 8.5 inserted after Phase 8.4: Blast Radius (URGENT)
- Phase 8.6 inserted after Phase 8.5: Version + Publish Integration (URGENT)
- Phase 14 added after Phase 13: RBAC and Admit Controls for Enterprise Tier
- GDPR & Data Lifecycle promoted from Deferred to Phase 15 (data model now stable)
- Phase 16 added: AppExchange Security Review (OWASP ZAP + static analysis + full compliance audit)

## Context for Next Session

**Last action:** Phase 12 Plan 01 COMPLETE — Session timeout enforcement (30-min idle + 8-hr absolute), session regeneration, logout hardening, audit hook
**Next step:** Phase 12 Plan 02 (CSRF guard) and Plan 03 (CORS/headers)

**Phase 12 Plan 01 COMPLETE (2026-02-16):**

- SessionGuard enforces 8-hour absolute timeout via createdAt check, resets idle timer via session.touch()
- @fastify/secure-session expiry set to 1800 seconds for idle timeout
- All three login paths (POST, GET JWT, OAuth callback) regenerate session before setting data (fixation prevention)
- onResponse audit hook logs auth.session_expired events with reason and actor context
- Logout hardened with Cache-Control: no-store header
- Frontend shows "Session refreshed" toast on successful silent re-auth
- 1 auto-fix: toast.info mock missing in api-error-handling test
- All 396 API tests pass, all packages typecheck clean

**Phase 11 Plan 03 COMPLETE (2026-02-16):**

- Outbound host allowlist enforcing MCE REST/SOAP/Auth host patterns with configurable log/block policy
- 50 MB maxContentLength on all MCE HTTP requests preventing memory exhaustion
- Global rate limiting at 120 req/min per authenticated user session with Redis-backed storage
- Health, metrics, and auth endpoints exempt from rate limiting via @SkipThrottle()
- 429 rate limit responses produce RFC 9457 Problem Details format
- 3 auto-fixed deviations: relative URL handling, TypeScript override modifier, ConfigService DI propagation to 6 integration tests
- Pre-existing API test failures (23 tests) from ZodValidationPipe refactoring unrelated to this plan
- All backend-shared tests pass, builds succeed

**Phase 10 Plan 05 COMPLETE (2026-02-16):**

- Gap closure: excluded /livez, /readyz, /metrics from global /api prefix
- setGlobalPrefix('api', { exclude: ['livez', 'readyz', 'metrics'] }) in configure-app.ts
- Observability endpoints now accessible at root level for Kubernetes probes and Prometheus scraping
- Updated configure-app unit test assertion for new call signature
- All 386 API + 244 Worker + 321 backend-shared tests pass

**Phase 10 Plan 02 COMPLETE (2026-02-16):**

- Kubernetes-ready /livez and /readyz health endpoints for API and Worker via @nestjs/terminus
- API: PostgresHealthIndicator (SELECT 1, 500ms timeout), RedisHealthIndicator (PING, 500ms timeout)
- Worker: PostgresHealthIndicator (SQL_CLIENT), RedisHealthIndicator (BullMQ queue client), BullMQHealthIndicator (client status)
- Old /health endpoint removed from API AppController, AppService simplified
- pino-loki multi-transport for Grafana Loki log shipping (activated via LOKI_HOST env var)
- AUTO_LOGGING_EXCLUDED_PATHS filters /health, /livez, /readyz, /metrics from access logs
- All 244 worker + 321 backend-shared + 386 API tests pass

**Phase 10 Plan 04 COMPLETE (2026-02-16):**

- API MetricsModule with /metrics Prometheus endpoint and 3 business metric providers
- Business metrics: qpp_queries_executed_total, qpp_mce_api_calls_total, qpp_query_duration_seconds
- Default Node.js metrics via collectDefaultMetrics with qpp_ prefix
- BullMQ trace propagation confirmed working via bullmq-otel telemetry option
- 4 operational runbooks: MCE timeouts, queue backlog, DB pool exhaustion, Redis connectivity
- Pre-existing issue: backend-shared build failure (Plan 02 committed test for code not yet created)
- All 386 API + 246 Worker + 2146 Web tests pass

**Phase 10 Plan 03 COMPLETE (2026-02-15):**

- Browser Sentry SDK initialized in instrument.ts with browserTracingIntegration
- instrument.ts imported as first line in main.tsx for early fetch/XHR instrumentation
- Sentry.ErrorBoundary wraps authenticated AppShell content with user-friendly fallback UI
- sentryVitePlugin conditionally activates when SENTRY_AUTH_TOKEN present
- build.sourcemap: true enables source map generation; filesToDeleteAfterUpload removes after upload
- @sentry/react and @sentry/vite-plugin installed
- Graceful no-op when VITE_SENTRY_DSN not set (dev environments)
- All 2146 web tests pass, all packages typecheck clean, build succeeds

**Phase 10 Plan 01 COMPLETE (2026-02-15):**

- Sentry SDK with OpenTelemetry auto-instrumentation for API and Worker
- instrument.ts files with beforeSend scrubbing (headers, tokens, passwords) and transaction filtering
- SentryModule.forRoot() registered as first import in both AppModules
- GlobalExceptionFilter upgraded: mock Sentry removed, @SentryExceptionCaptured decorator added
- observabilitySchema added to env.schema.ts (SENTRY_DSN, SENTRY_ENVIRONMENT, LOKI_HOST/USERNAME/PASSWORD)
- All Phase 10 npm deps installed (@sentry/nestjs, @nestjs/terminus, bullmq-otel, prom-client, pino-loki, @sentry/react, @sentry/vite-plugin)
- App module test timeouts increased to 15s (OTel dependency overhead)
- All 389 API + 246 Worker + 2146 Web tests pass, zero regressions

**Phase 9 Plan 06 COMPLETE (2026-02-15):**

- Fixed UAT bugs in AuditLogQueryParamsSchema and HistoryQueryParamsSchema
- dateFrom/dateTo now accept both ISO datetime (2026-02-14T00:00:00Z) and date-only (2026-02-14)
- pageSize minimum lowered from 10 to 1 (0 still rejected)
- Created audit.test.ts with 12 tests for AuditLogQueryParamsSchema
- Updated execution-history.test.ts with corrected boundary test and new date format tests
- All 93 shared-types tests pass, all 3301 monorepo tests pass

**Phase 9 Plan 02 COMPLETE (2026-02-14):**

- AuditService with log() method wrapping insert in RLS tenant context
- IAuditLogRepository interface + DrizzleAuditLogRepository using getDbFromContext() pattern
- @Audited('event.type') decorator using SetMetadata pattern
- AuditInterceptor reads metadata via Reflector, fires after handler success via tap()
- extractTargetId fallback: route params -> responseData.id for create events
- @Global() AuditModule with APP_INTERCEPTOR registration in app.module.ts
- Non-fatal error handling: try/catch in log() prevents audit crashes from affecting requests
- All 311 API tests pass, full monorepo typecheck clean

**Phase 9 Plan 04 COMPLETE (2026-02-14):**

- GET /api/audit-logs endpoint with enterprise-only feature gating
- AuditController: SessionGuard + FeaturesService.getTenantFeatures() + features.auditLogs check
- Non-enterprise users get AppError(ErrorCode.FEATURE_NOT_ENABLED) matching shell-query pattern
- DrizzleAuditLogRepository.findAll: dynamic WHERE builder with 6 filter dimensions
- eventType prefix match (saved_query.* -> LIKE 'saved_query.%'), actorId, targetId, dateFrom, dateTo
- JSONB metadata::text ILIKE for free-text search (does not use GIN index — acceptable for filtered enterprise endpoint)
- Parallel count + data queries for pagination; response shape { items, total, page, pageSize }
- AuditService.findAll wraps repository in RLS tenant context (tenant_id + mid isolation)
- FeaturesModule imported in AuditModule (not @Global, follows ShellQueryModule pattern)
- All 311 API tests, 2946 total tests pass, full monorepo typecheck clean

**Phase 9 Plan 05 COMPLETE (2026-02-14):**

- 12 @Audited decorators on all mutation controller methods across 4 controllers
- saved_query: created, updated, deleted; folder: created, updated (with name metadata), deleted
- query_activity: created, linked, unlinked, published; version: restored, renamed
- auth.login logged in ALL THREE login paths (loginPost, login GET JWT, callback)
- auth.logout reads session BEFORE deletion; skips logging if session empty/expired
- auth.oauth_refreshed logged after successful token refresh
- system.sweeper_run logged via direct INSERT inside RLS context with sweep count metadata
- performSweep refactored to return { attemptedCount, deletedCount, failedCount }
- auth.session_expired deferred to Phase 12 (SessionGuard cross-package DI)
- system.retention_purge deferred to Phase 14 (global partition drops, no tenant context)
- All tests pass: API 311, Worker 241, Web 2146

**Phase 9 Plan 03 COMPLETE (2026-02-14):**

- AuditRetentionSweeper: nightly cron (2 AM) purges expired partitions via DETACH+DROP
- Monthly cron (25th) pre-creates next 2 months of partitions with IF NOT EXISTS
- Uses MAX(COALESCE(audit_retention_days, 365)) — safe, no premature deletion
- Per-partition error handling: one failure does not stop others
- AuditRetentionModule registered in worker app.module.ts
- Follows established ShellQuerySweeper cron pattern
- All 241 worker tests pass, full monorepo typecheck clean

**Phase 9 Plan 01 COMPLETE (2026-02-14):**

- Migration 0025: Partitioned audit_logs table (monthly RANGE on created_at) with 3 initial partitions + default
- Migration 0026: RLS tenant+mid isolation with USING + WITH CHECK
- Migration 0027: Immutability trigger function + BEFORE UPDATE/DELETE triggers + audit_retention_days on tenants
- Triple-index strategy: (tenant_id, mid, created_at DESC), (tenant_id, mid, event_type), GIN metadata jsonb_path_ops
- Drizzle schema: auditLogs pgTable with jsonb import, selectAuditLogSchema/insertAuditLogSchema exports
- Shared types: AuditEventType (18 events), AUDIT_EVENT_TYPES array, AuditLogItemSchema, AuditLogListResponseSchema, AuditLogQueryParamsSchema
- Fixed: tenant test fixtures (features.service, seat-limit.service) updated for auditRetentionDays column
- All 311 API tests, all web/database/shared-types tests pass, full monorepo typecheck clean

**Phase 8.6 Plan 05 COMPLETE (2026-02-13):**

- 12 VersionTimeline publish indicator tests: green pulsing dot, grey dot, no indicator, badges (published/was published/Nx), expand/collapse, edge cases
- 10 VersionHistoryPanel gap counter tests: singular/plural text, hidden when latest published, hidden when no events, isLinked fetch gating, publish state wiring
- All 132 web test files (1867 tests) pass, zero regressions
- Phase 8.6 Version + Publish Integration now COMPLETE (5/5 plans)

**Phase 8.6 Plan 04 COMPLETE (2026-02-13):**

- Backend: 3 repository tests (findBySavedQueryId) + 6 service tests (listPublishEvents + feature gating)
- Frontend: 15 publish-utils tests (8 computeVersionGap + 7 derivePublishState)
- Frontend: 7 usePublishEvents hook tests (enabled/disabled, data fetch, error)
- Frontend: 1 usePublishQuery cache invalidation test (publishEventsKeys.list)
- ESLint fix: replaced non-null assertions with optional chaining in test assertions
- All 302 API tests, 1866 web tests pass (1 pre-existing FeatureGate failure unrelated)

**Phase 8.6 Plan 03 COMPLETE (2026-02-13):**

- VersionTimeline: green pulsing dot on currently-published version, grey dot on previously-published
- VersionTimeline: PublishBadge sub-component with expandable publish history timestamps
- VersionHistoryPanel: usePublishEvents hook call when query is linked
- VersionHistoryPanel: derivePublishState + computeVersionGap for publish state derivation
- VersionHistoryPanel: gap counter ("N versions ahead") in panel header with warning palette
- VersionHistoryPanel: publish state props passed down to VersionTimeline
- Test mocks updated in 2 test files for usePublishEvents compatibility
- All 128 web test files (1822 tests) pass, zero regressions

**Phase 8.6 Plan 02 COMPLETE (2026-02-13):**

- fetchPublishEvents API client function in query-activities service
- usePublishEvents hook with publishEventsKeys factory (30s staleTime)
- usePublishQuery onSuccess invalidates publishEventsKeys.list(savedQueryId)
- computeVersionGap utility for version-ahead count (handles all edge cases)
- derivePublishState utility producing PublishState (currentPublishedVersionId, publishedVersionIds Set, publishEventsByVersionId Map)
- publish-pulse CSS animation with prefers-reduced-motion fallback
- MSW handler for publish-events endpoint
- All 1822 web tests pass across 128 files, zero regressions

**Phase 8.6 Plan 01 COMPLETE (2026-02-13):**

- findBySavedQueryId repository method with desc(createdAt) ordering
- PublishEventListItemSchema and PublishEventsListResponseSchema Zod schemas in shared-types
- GET :savedQueryId/versions/publish-events endpoint on QueryVersionsController
- Feature-gated behind versionHistory, RLS-enforced tenant+mid isolation
- Static route correctly ordered before parameterized :versionId
- Existing test updated with new repository mock dependency
- All 293 API tests pass, full monorepo typecheck clean

**Phase 8.5 Plan 04 COMPLETE (2026-02-12):**

- LinkedBadge md variant restructured: count suffix moved outside truncate span as flex sibling with shrink-0
- Widened outer container from max-w-48 to max-w-64 for breathing room
- New structural regression test verifies count suffix stays outside truncated region
- UAT gaps 1+2 closed, gap 3 accepted as data availability constraint
- All 1822 web tests pass across 128 files, zero regressions

**Phase 8.5 COMPLETE (2026-02-12):**

- Plan 01: Frontend blast radius error states + toolbar automation count (3 commits)
  - PublishConfirmationDialog: `blastRadiusError` prop with text-destructive error state
  - UnlinkModal: `effectiveSafetyTier` memo overrides to tier 2 on blast radius fetch error
  - LinkedBadge: `automationCount` prop with `formatCountSuffix()` helper for md + sm variants
  - EditorWorkspace: `toolbarBlastRadius = useBlastRadius(activeTabLinkedSavedQueryId)` for always-on fetch
- Plan 02: Backend getBlastRadius edge-case unit tests (7 new tests, 1 commit)
  - null/undefined items, undefined/unknown statusId, undefined count, null steps, null activities
- Plan 03: Frontend tests (15 new tests, 2 commits)
  - LinkedBadge automation count (7 tests), PublishConfirmationDialog error (3 tests), UnlinkModal-error (5 tests)
- All 293 API tests, 1822 web tests pass, zero regressions
- 23 new tests total (7 backend + 16 frontend)

**Phase 8.5 Plan 03 COMPLETE (2026-02-12):**

- 15 new test cases across 3 files for blast radius UI behaviors
- LinkedBadge: 7 tests for automationCount prop (md count display, singular/plural, null/undefined/0, sm tooltip)
- PublishConfirmationDialog: 3 tests for blastRadiusError prop (error message, empty state hidden, button enabled)
- UnlinkModal-error: 5 tests for error-state tier 2 fallback (no "not used" message, delete-both warning, no checkbox, confirm disabled/enabled)
- All 1821 web tests pass across 128 files, zero regressions
- Phase 8.5 (Blast Radius) now COMPLETE: 3/3 plans

**Phase 8.5 Plan 01 COMPLETE (2026-02-12):**

- PublishConfirmationDialog: added blastRadiusError prop and error state rendering (text-destructive)
- UnlinkModal: effectiveSafetyTier pattern with tier 2 fallback on blast radius error
- LinkedBadge: automationCount prop with count display in md variant and tooltip in sm variant
- EditorWorkspace: toolbar useBlastRadius instance for always-on blast radius awareness, blastRadiusError wired to publish dialog
- Updated 4 test assertions for new error message text
- All 127 web test files (1806 tests) pass, zero regressions

**Phase 8.5 Plan 02 COMPLETE (2026-02-12):**

- 7 edge-case unit tests for defensive MCE response parsing in getBlastRadius
- Covers: null/undefined items, undefined statusId (defaults to BuildError), unknown statusId (maps to Unknown), undefined count (stops pagination), null steps (skipped), null activities (skipped)
- mockListAndDetail helper for URL-based list/detail dispatch
- All 293 API tests pass, zero regressions

**Phase 8.4 Plan 06 COMPLETE (2026-02-12):**

- Fixed AutomationListResponse: items->entry, count->totalResults, removed page/pageSize to match MCE REST API
- Fixed AutomationItem: statusId->status to match MCE API response
- Added ON DELETE SET NULL to shell_query_runs.savedQueryId FK (migration 0024)
- Discovered and fixed: unit test file also used old field names, DB constraint had auto-generated name
- All 285 API tests, 62 e2e tests, 1802 web tests pass, zero regressions
- Phase 8.4 (Unlink) UAT gaps closed: 6/6 plans complete

**Phase 8.4 Plan 05 COMPLETE (2026-02-12):**

- 5 EditorWorkspace unlink integration tests: toolbar visibility (linked/unlinked/feature-gated), modal opening, tab state clearing
- 3 QueryTreeView unlink context menu tests: option visibility for linked/unlinked, callback invocation
- All 1802 web tests pass, zero regressions
- Phase 8.4 (Unlink) now COMPLETE: 5/5 plans across backend, frontend, and tests

**Phase 8.4 Plan 04 COMPLETE (2026-02-12):**

- 30 comprehensive UnlinkModal component tests (820 lines)
- All four unlink options tested: unlink-only, delete-local, delete-remote, delete-both
- All three safety tiers tested: Tier 1 (no automations), Tier 2 (inactive), Tier 3 (active/scheduled)
- Type-to-confirm validation with exact case-sensitive matching
- Tier 3 dual gate (checkbox + name confirmation) thoroughly tested
- Mutation payload verification per option via MSW request spy
- Quality audit: no weak assertions, no conditional expects, AAA structure throughout
- All 1802 web tests pass, zero regressions

**Phase 8.4 Plan 02 COMPLETE (2026-02-12):**

- Enhanced unlinkQuery service and useUnlinkQuery hook to accept { deleteLocal, deleteRemote } options
- Created UnlinkModal (392 lines) with 4 radio options and 3 safety tiers (blast-radius-driven)
- Wired Unlink button into toolbar (LinkBrokenMinimalistic icon) for linked queries
- Added "Unlink from Query Activity" to QueryTreeView context menu for linked queries
- After unlink: tab link state cleared (badge disappears); after unlink+deleteLocal: tab closes
- All 1764 web tests pass, zero regressions

**Phase 8.4 Plan 03 COMPLETE (2026-02-11):**

- 2 new unit tests: SOAP error propagation (unlink completes before error), capture ordering (objectId captured pre-unlink)
- 5 integration tests: full lifecycle, deleteLocal, deleteRemote, feature gating (403), RLS isolation
- 5 of 7 planned unit tests already existed from Plan 01; only 2 genuinely new
- Integration test file was already committed in a5b7074 from Plan 02; verified all 5 tests pass
- All 285 API unit tests + 272 integration tests pass, zero regressions

**Phase 8.4 Plan 01 COMPLETE (2026-02-11):**

- UnlinkRequestSchema with deleteLocal/deleteRemote boolean fields defaulting to false
- Service method captures linkedQaObjectId before unlink, validates deleteRemote feasibility
- Controller accepts optional DELETE body via UnlinkRequestSchema.safeParse, backwards compatible
- 4 new unit tests (no-options, deleteLocal, deleteRemote, both, INVALID_STATE guard)
- All 283 API tests pass, full monorepo typecheck clean

**Phase 8.3 Plan 03 COMPLETE (2026-02-11):**

- 20 ImportQueryModal component tests: browse/configure steps, both import modes, search, loading/error states, tier-gated folders, edge cases
- 6 EditorWorkspace import integration tests: feature gating, modal open, both import modes with tab store assertions
- All 1763 web tests pass (1737 existing + 26 new), zero regressions
- Phase 8.3 now COMPLETE (3/3 plans: backend API, frontend UI, comprehensive tests)

**Phase 8.3 Plan 02 COMPLETE (2026-02-11):**

- ImportQueryModal with browse/configure two-step flow (314 lines)
- Browse step: QA list with search, rich metadata (target DE, data action, date), imperative SQL fetch
- Two import modes: "Open in Editor" (ephemeral tab) and "Import as Saved Query" (persistent saved query)
- Toolbar Import button feature-gated behind deployToAutomation, works from any tab
- MSW handler for QA detail endpoint added to global test handlers
- EditorWorkspace test mocks updated with useCreateSavedQuery for compatibility
- All 1737 web tests pass, zero regressions

**Phase 8.2 Plan 04 COMPLETE (2026-02-11):**

- 21 integration tests across 3 files for publish, drift, and blast-radius endpoints
- Publish: 10 tests covering MCE PATCH + event creation, specific version publish, feature gating (403), validation (400), not found (404 x3), MCE failure atomicity, auth (401)
- Drift: 5 tests covering no-drift (matching hashes), drift detected, feature gating (403), not-linked (404), empty local SQL
- Blast radius: 6 tests covering matching automations, empty list, high-risk detection, feature gating (403), not-linked (404), pagination
- All 278 API unit tests + 257 integration tests pass, zero regressions

**Phase 8.2 COMPLETE (2026-02-11):**

- All 10 plans executed successfully across 3 waves
- Backend: query_publish_events table + RLS, publish/drift/blast-radius service methods, controller endpoints
- Frontend: API clients, TanStack Query hooks, PublishConfirmationDialog, DriftDetectionDialog, editor toolbar integration
- Testing: 21 integration tests + 34 unit tests (API) + 67 frontend tests + 17 shared-types tests
- Phase 8.2 delivered the complete Publish workflow: push SQL from versioned queries to linked Query Activities in Automation Studio

**Phase 8.2 Plan 06 COMPLETE (2026-02-11):**

- 67 new Vitest tests across 6 test files for publish feature frontend
- Hook tests: usePublishQuery (7 tests), useDriftCheck (7 tests), useBlastRadius (6 tests)
- Dialog tests: PublishConfirmationDialog (14 tests), DriftDetectionDialog (9 tests)
- Integration tests: EditorWorkspace-publish (9 tests) covering button visibility, must-save guard, confirmation flow
- MSW handlers added for publish, drift, blast-radius endpoints in global handlers
- Patterns: vi.hoisted() for mock state, refetch() return value for enabled:false hooks, post-render updateTabLinkState
- All 1737 web tests pass, zero regressions

**Phase 8.2 Plan 08 COMPLETE (2026-02-11):**

- Unit tests for publish(), checkDrift(), getBlastRadius() service methods (23 tests)
- Controller tests for publishQuery, checkDrift, getBlastRadius endpoints (11 tests)
- Module test verifying QueryActivitiesModule class definition (1 test)
- MCE-first ordering verified via call-order tracking; SHA-256 hash computation verified
- High-risk status detection (3/6/7) and objectTypeId 300 filtering verified
- Zod validation and feature gating verified on all endpoints
- 34 total test cases across 3 files, all 278 API tests pass, zero regressions

**Phase 8.2 Plan 10 COMPLETE (2026-02-11):**

- Gap closure: unit tests for Plan 02 version-SQL methods and publish event repository
- SavedQueriesService: getLatestVersionSql (5 tests), getVersionSql (5 tests) covering return shapes, null paths, encryption, decryption failure
- DrizzleQueryPublishEventsRepository: create (3 tests), findLatestBySavedQueryId (3 tests) with Proxy-based Drizzle mock chain
- 16 new test cases, all 278 API tests + 29 database tests pass, zero regressions

**Phase 8.2 Plan 09 COMPLETE (2026-02-11):**

- Gap closure: unit tests for Plan 03 API client functions and Plan 05 VersionHistoryPanel publish button
- API client tests: publishQuery POST URL+body, checkDrift GET URL, getBlastRadius GET URL (7 cases)
- VersionHistoryPanel tests: publish button visible when isLinked+onPublishVersion, hidden otherwise (8 cases)
- onPublishVersion callback verified with correct versionId (auto-selected latest)
- All 1705 web tests pass, zero regressions

**Phase 8.2 Plan 05 COMPLETE (2026-02-11):**

- Publish button in editor toolbar for linked saved queries (Export icon, feature-gated)
- Must-save-first guard: toast.warning for dirty or untitled tabs
- Drift detection on linked query open (once per tab via ref Set) and before publish
- DriftDetectionDialog: Keep Mine (proceed to publish), Accept Theirs (save remote SQL locally)
- PublishConfirmationDialog: diff/editor preview + blast radius + confirm
- Per-version publish button in Version History panel header
- Terminology: "Deploy to Automation" -> "Create in AS" (toolbar), "Create Query Activity" (modal)
- FeatureGate, UpgradeModal text updated for new terminology
- All 1670 web tests pass, typecheck clean

**Phase 8.2 Plan 03 COMPLETE (2026-02-11):**

- API client: publishQuery, checkDrift, getBlastRadius added to query-activities service
- usePublishQuery mutation hook with cache invalidation (saved-queries, query-activities, version history)
- useDriftCheck manual-trigger hook (enabled: false, staleTime: 0)
- useBlastRadius auto-fetch hook (staleTime: 30s)
- PublishConfirmationDialog: diff preview + blast radius list + AS editability note
- DriftDetectionDialog: diff + Keep Mine / Accept Theirs resolution
- Both dialogs follow LinkConflictDialog pattern, exported from barrel
- All 1670 web tests pass

**Phase 8.2 Plan 07 COMPLETE (2026-02-11):**

- Gap closure: unit tests for Plan 01 database schema and REST builders
- Schema test: query_publish_events table name, 9 columns, 3 indexes verified via getTableConfig
- REST builder tests: buildUpdateQueryTextRequest (URL encoding, input validation, 8 cases)
- REST builder tests: buildGetAutomationsRequest (pagination URL, input validation, 4 cases)
- 17 new test cases, all 305 backend-shared tests + 29 database tests pass

**Phase 8.2 Plan 01 COMPLETE (2026-02-11):**

- Migration 0020: query_publish_events table (annotation model for version publishing)
- Migration 0021: RLS policy with tenant_id + mid isolation
- FK cascades on saved_query_id and version_id, 3 indexes
- Zod schemas: PublishQueryRequestSchema, PublishQueryResponseSchema, DriftCheckResponseSchema, BlastRadiusResponseSchema, AutomationInfoSchema
- MCE REST builders: buildUpdateQueryTextRequest (PATCH), buildGetAutomationsRequest (GET)
- All 2,702 tests pass, all 9 packages typecheck clean

**Phase 8.1 Plan 07 COMPLETE (2026-02-09):**

- 72 new tests: 25 backend integration + 35 frontend component + 12 frontend hook/store
- Backend integration tests: link CRUD, duplicate protection (409), one-to-one enforcement, feature gating (403), RLS isolation, conflict resolution, validation
- Frontend component tests: LinkedBadge, LinkConflictDialog, LinkQueryModal, QueryTreeView-linking
- Frontend hook/store tests: useLinkQuery, useUnlinkQuery, useQueryActivitiesList, useQueryActivityDetail, updateTabLinkState
- Bug fix: saved_queries RLS broadened from per-user to per-BU (migration 0019) -- findAllLinkedQaKeys was silently returning empty results
- All 173 API integration tests pass, all 227 API unit tests pass, all 1632 web tests pass

**Phase 8.1 Plan 06 COMPLETE (2026-02-09):**

- QueryTreeView: LinkedBadge (sm) next to linked query names, "Link to Query Activity" context menu
- EditorWorkspace toolbar: Link button for unlinked saved queries, LinkedBadge (md) status for linked queries
- LinkQueryModal integrated with state management, onCreateNew delegates to QueryActivityModal
- Deploy-then-link: backend returns { objectId, customerKey }, frontend auto-links after QA creation
- Tab link state populated on open from sidebar, updated after link/deploy-then-link operations
- All entry points feature-gated with deployToAutomation via useFeature hook
- MSW handlers added for query-activities endpoints
- All 1574 web tests pass, all 227 API tests pass, typecheck clean

**Phase 8.1 Plan 05 COMPLETE (2026-02-09):**

- LinkedBadge: sm (icon-only, 12px) and md (icon+text, 16px) variants with emerald-500 accent
- LinkConflictDialog: Monaco DiffEditor side-by-side with "Keep Q++ Version" / "Keep AS Version" buttons
- LinkQueryModal: browse/select QA list with search, linked-QA greying, conflict detection flow
- Selection flow: click QA -> fetch detail -> SQL match = silent link, SQL mismatch = conflict dialog
- "Create New" button delegates to onCreateNew prop for external QA creation modal
- Toast feedback on success/error, loading/empty states, inline fetch error display
- All three components exported with clean interfaces for Plan 06 workspace integration

**Phase 8.1 Plan 04 COMPLETE (2026-02-09):**

- API client: listQueryActivities, getQueryActivityDetail, linkQuery, unlinkQuery functions
- TanStack Query: useQueryActivitiesList (30s staleTime), useQueryActivityDetail hooks
- Mutations: useLinkQuery, useUnlinkQuery with cache invalidation (saved-queries + query-activities)
- queryActivityKeys factory exported for cross-hook cache key sharing
- Types: SavedQuery extended with linkedQaCustomerKey/linkedQaName/linkedAt
- Types: QueryTab extended with optional linkedQaCustomerKey/linkedQaName
- Tabs store: Tab extended with link fields, updateTabLinkState action, openQuery accepts linkState
- All 51 related tests pass

**Phase 8.1 Plan 03 COMPLETE (2026-02-09):**

- Repository layer: linkToQA, unlinkFromQA, findAllLinkedQaKeys methods in interface + Drizzle implementation
- Service layer: linkToQA, unlinkFromQA, findAllLinkedQaKeys on SavedQueriesService; listAllWithLinkStatus, getDetail, linkQuery, unlinkQuery on QueryActivitiesService
- Controller: GET /query-activities (QA list with isLinked/linkedToQueryName), GET /query-activities/:customerKey (QA detail with queryText)
- Controller: POST /query-activities/link/:savedQueryId (establish link), DELETE /query-activities/link/:savedQueryId (remove link)
- All endpoints feature-gated behind deployToAutomation, CsrfGuard on POST/DELETE
- Conflict resolution: keep-remote updates saved query SQL to QA's SQL
- Saved query list/detail responses now include link fields (linkedQaCustomerKey, linkedQaName, linkedAt)
- 7 new unit tests, all 227 API tests pass, full monorepo typecheck clean
- Deviation: fixed web optimistic cache update to include link fields in SavedQueryListItem

**Phase 8.1 Plan 01 COMPLETE (2026-02-09):**

- 4 nullable link columns on saved_queries (linked_qa_object_id, linked_qa_customer_key, linked_qa_name, linked_at)
- Partial unique index saved_queries_linked_qa_unique on (tenant_id, mid, linked_qa_customer_key)
- query_versions RLS broadened from tenant+mid+user to tenant+mid
- Shared Zod types: QAListItemSchema, QADetailSchema, LinkQueryRequestSchema, LinkQueryResponseSchema
- SavedQueryListItemSchema and SavedQueryResponseSchema extended with link fields
- Fixed stale drizzle snapshots (0014-0016) from prior custom migrations
- All packages typecheck clean

**Phase 7 Plan 05 COMPLETE (2026-02-08):**

- EditorWorkspace integration: editor takeover mode, toolbar + context menu entry points
- Version History toolbar button (History icon) for saved query tabs
- Unsaved changes warning dialog (three-button: Save & Continue / Continue Without Saving / Cancel)
- Restore handler updates editor content and exits version history
- Version list cache invalidation after saves
- Context menu "Version History" entry on QueryTreeView queries
- MSW handlers for version history endpoints (list + detail)
- VersionHistoryPanel exported from components barrel index
- All 1561 web tests pass, typecheck clean across all packages

**Phase 7 Plan 04 COMPLETE (2026-02-08):**

- VersionHistoryPanel: split-pane layout (DiffViewer flex-1 + Timeline sidebar w-64)
- Auto-selects newest version, dual useVersionDetail for selected + previous version diff
- Show Changes toggle (button with active/inactive visual state)
- Restore flow: confirmation dialog -> mutation -> toast feedback -> onRestore(sqlText) + onClose()
- Free tier: LockedOverlay with "Unlock Version History" CTA
- Header: query name, "Version History" label, Show Changes toggle, Close button
- All 1561 web tests pass, typecheck clean, lint clean

**Phase 7 Plan 03 COMPLETE (2026-02-08):**

- TanStack Query hooks: useQueryVersions (30s staleTime), useVersionDetail (Infinity staleTime), useRestoreVersion, useUpdateVersionName
- versionHistoryKeys query key factory for cache invalidation
- useVersionHistoryStore Zustand store: isOpen, savedQueryId, selectedVersionId, showChanges toggle
- VersionDiffViewer: Monaco DiffEditor wrapper with renderSideBySide: false (inline diff per CONTEXT.md)
- VersionDiffViewer: falls back to read-only Editor when showChanges is false or no previous version
- VersionTimeline: sorted version list with timestamp, line count delta, source badge, inline-editable names
- All 1561 web tests pass

**Phase 7 Plan 01 COMPLETE (2026-02-08):**

- Migration 0015: query_versions table (append-only, FK cascade to saved_queries)
- Migration 0016: RLS policy query_versions_user_isolation (tenant_id + mid + user_id)
- versionHistory feature key (Pro/Enterprise only, 13th feature key)
- Zod schemas: VersionListItemSchema, VersionDetailSchema, VersionListResponseSchema, UpdateVersionNameSchema
- Updated all feature test expectations across 3 test files
- All 205 API tests + 1561 web tests pass

**Phase 6 Plan 06 COMPLETE (2026-02-07):**

- Per-query history access via right-click "View Run History" context menu on saved queries
- Editor toolbar ClockCircle button for saved query tabs -> opens per-query history
- Activity Bar store extended: historyQueryIdFilter, showHistoryForQuery, clearHistoryFilter
- HistoryPanel breadcrumb: "Showing: [Query Name]" with "View All History" clear-filter button
- savedQueryId threaded from frontend execute() through API controller to database
- Execution history cache invalidation after run creation (executionHistoryKeys.all)
- Local historyQueryIdFilter useState replaced with Zustand store-managed state
- All 1542 web tests + 191 API tests pass

**Phase 6 Plan 05 COMPLETE (2026-02-07):**

- useExecutionHistory TanStack Query hook (GET /runs/history, 30s staleTime, keepPreviousData)
- HistoryPanel component: 7 data columns + actions dropdown (Open in new tab, Copy SQL)
- Status filter pills (multi-select), date preset buttons (Today/7d/30d/month), debounced search
- Server-side pagination (25/page), sorting (createdAt default desc)
- Free-tier gating: LockedOverlay + "Unlock Execution History" CTA -> UpgradeModal
- WorkspaceSidebar: replaced placeholder with HistoryPanel, hides search and footer for history view
- EditorWorkspace: re-run handler (new untitled tab), copy SQL handler (clipboard), UpgradeModal wiring
- Global MSW handlers updated with /api/runs/history and executionHistory/runToTargetDE features
- All 1542 tests pass across web package

**Phase 6 Plan 04 COMPLETE (2026-02-07):**

- Persist encrypted SQL text to shell_query_runs during createRun (zero extra encryption overhead)
- Row count written by worker on successful completion via checkRowsetReady and probe fast-path
- GET /runs/history endpoint with pagination, filtering (status, date range, queryId, search), sorting
- Feature gated to Pro/Enterprise (free tier gets FEATURE_NOT_ENABLED)
- SQL preview truncated to 200 chars, error messages decrypted for display
- listRuns repository with dynamic WHERE clause builder pattern
- Updated test stubs with listRuns and listHistory methods
- All 2374 tests pass across all packages

**Phase 6 Plan 01 COMPLETE (2026-02-07):**

- Migration 0014: sql_text_encrypted, row_count, saved_query_id on shell_query_runs
- Dropped unused query_history table
- executionHistory feature key (Pro/Enterprise only)
- Zod schemas: ExecutionHistoryItemSchema, HistoryListResponseSchema, HistoryQueryParamsSchema
- Cleaned dead queryHistory references from integration + e2e tests
- Updated features service test expectations for 12th feature key
- All 2374 tests pass across all packages

**Phase 5 Plan 01 COMPLETE (2026-02-07):**

- QUOTA_EXCEEDED error code with HTTP 429, terminal policy, RFC 9457 title
- UsageResponse Zod schema in shared-types (queryRuns + savedQueries)
- countMonthlyRuns repository method (excludes canceled, UTC month boundaries)
- UsageService with getUsage() and getMonthlyRunCount()
- UsageController serves GET /api/usage (SessionGuard only)
- Quota guard in ShellQueryController.createRun blocks free-tier at 50 runs/month
- All 191 API tests pass with zero regressions

**Phase 5 Plan 02 COMPLETE (2026-02-07):**

- Extended QUOTA_LIMITS with queryRuns (free=50, pro/enterprise=null)
- Added WARNING_THRESHOLD (0.8) and useQueryRunLimit hook
- Created useRunUsage TanStack Query hook (GET /api/usage, 30s staleTime)
- Created useUsageStore Zustand store (session-scoped banner dismissal)
- Local UsageResponse type (pending shared-types from Plan 01)

**Phase 5 Plan 03 COMPLETE (2026-02-07):**

- UpgradeModal with crown icon, Pro benefits list, placeholder "Coming soon" CTA
- UsageWarningBanner dismissible amber banner at 80% threshold
- QuotaBlockedDefault wired to open UpgradeModal
- EditorWorkspace: quota check in handleRunRequest, warning banner, UpgradeModal
- WorkspaceSidebar: footer badge with QuotaCountBadge (runs X/50) for free tier
- Badge color escalation: normal -> warning amber -> destructive red
- Cache invalidation after run creation via usageQueryKeys.all
- Run tooltip: "Monthly run limit reached. Click to upgrade." at limit

**Phase 6 Plan 03 COMPLETE (2026-02-07):**

- Activity Bar store (Zustand) with activeView state and toggleView action
- ActivityBar component with 3 icons (Database, Folder2, ClockCircle) + Radix tooltips
- EditorWorkspace refactored: removed internal sidebar state, delegates to store
- WorkspaceSidebar refactored: accepts activeView prop, removed internal tabs
- Panel header with view title and collapse button
- History placeholder ready for Plan 05 wiring
- 30/30 tests pass (19 EditorWorkspace + 11 WorkspaceSidebar)

**Phase 6 Plan 02 COMPLETE (2026-02-07):**

- StatusBadge CVA component with 6 variants (success, failed, canceled, running, queued, default)
- Animated pulse dot indicator for running state
- runStatusToVariant() helper for mapping run status strings
- DataTable<TData> generic component with server-side pagination/sorting
- DataTableColumnHeader with sort toggle using Solar icons
- DataTablePagination with first/prev/next/last controls
- DataTableToolbar with debounced search and filter slot
- @tanstack/react-table@^8.21.3 installed

**Phase 3.1 COMPLETE (2026-02-06):**

- Plan 01 COMPLETE: Extracted DataExtensionForm from DataExtensionModal
  - DataExtensionForm.tsx — reusable form with all state/validation
  - DataExtensionModal.tsx — thin wrapper with Dialog
- Plan 02 COMPLETE: Wired into TargetDataExtensionModal with view toggle
  - TargetDECreationView.tsx — creation view with schema inference
  - TargetDataExtensionModal.tsx — view toggle (selection/creation)
  - Bug fixes: customerKey (#39), field caching, coverage gate

**Phase 3 COMPLETE (2026-02-04):**

- Backend: QueryActivitiesModule with POST /query-activities endpoint (11 unit tests)
- Backend: RunToTargetFlow strategy with schema validation (5 integration tests)
- Frontend: QueryActivityModal for Automation Studio deployment (7 UI tests)
- Frontend: TargetDataExtensionModal for target DE selection
- Frontend: RunButtonDropdown with "Run to Target DE" option
- Feature gating: Pro tier for deployToAutomation, runToTargetDE
- E2E evidence: `.screenshots/E2E-TEST-RESULTS.md` (36 tests passed)

**Gap identified → Phase 3.1:**
- TargetDataExtensionModal only supports selecting existing DEs
- DataExtensionModal exists for DE creation but not wired into Run to Target flow
- Phase 3.1 will integrate these components

**Phase 2 COMPLETE:**

- DB: `folders` and `saved_queries` tables with RLS (migrations applied)
- API: FoldersModule complete with CRUD endpoints (16 integration tests)
- API: SavedQueriesModule complete with encryption (15 integration tests)
- Frontend: Zustand tabs store and TanStack Query hooks complete (02-04)
- Frontend: QueryTreeView integrated into WorkspaceSidebar (02-05)
- Frontend: QueryTabBar with drag-and-drop integrated into EditorWorkspace (02-06)
- Frontend: QuotaGate component for tier-based limits (5 free, unlimited Pro) (02-07)
- Frontend: SaveQueryModal with API integration and folder selection (02-07)
- Frontend: Auto-save for existing queries via useUpdateSavedQuery (02-07)

**Phase 2 summary (Saved Queries & History):**

- DB: `folders` + `saved_queries` tables with RLS
- API: Full CRUD for folders and saved queries
- SQL text encrypted at rest via EncryptionService
- Frontend: Complete save flow with tier-based gating
- Requirements: SAVE-01, SAVE-02, SAVE-03, SAVE-04 addressed

**Deferred GDPR work:**
Context captured in `.planning/phases/deferred-gdpr-readiness/CONTEXT.md` — includes all decisions made during discussion (deletion triggers, user vs tenant handling, export format, audit requirements).

## Session Continuity

**Last session:** 2026-02-16T19:10:00Z
**Stopped at:** Completed 12-01-PLAN.md (session timeout enforcement)
**Resume file:** .planning/phases/12-security-baseline/12-01-SUMMARY.md

## Blockers

None currently.

## Notes

- Existing codebase mapped in `.planning/codebase/`
- DB tables exist for `query_history` and `snippets` (need wiring)
- UI scaffolding exists for `QueryActivityModal` (needs backend)
- Feature flag infrastructure ready for tier gating
- Error infrastructure complete (AppError, DomainError, RFC 9457 responses)
- Backend consolidation complete — clean architectural foundation established
- Logging infrastructure complete — Pino with auto-context binding
- Encryption infrastructure COMPLETE — all sensitive data encrypted at rest (Auth tokens, BullMQ jobs, error messages)
- Test infrastructure COMPLETE — shared config, workspace projects, test-utils package, standardized naming, all tests migrated to @qpp/test-utils
- Test quality tooling COMPLETE — @vitest/eslint-plugin with 10 rules, CI delta coverage, test quality standards, comprehensive audit inventory
- Performance infrastructure COMPLETE — MCE_TIMEOUTS and withRetry wired into production (MceBridgeService, RestDataService, MceQueryValidator)

---
*State initialized: 2026-01-20*
*Last updated: 2026-02-16 — Phase 12 Plan 01 COMPLETE (session timeouts, regeneration, audit hook, logout hardening)*
