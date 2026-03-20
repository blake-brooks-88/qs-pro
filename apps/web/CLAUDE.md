# apps/web

React 18 + Vite frontend. Monaco-based SQL IDE with Zen Mode UI.

## Commands

```bash
pnpm web:dev                       # Dev server on :5173
pnpm --filter @qpp/web test        # Unit tests
```

## Feature Structure

Features live in `src/features/`. Each feature owns its UI, hooks, stores, and types:

```
feature/
├── components/          # Feature-specific UI
│   └── __tests__/
├── hooks/               # TanStack Query data fetching
│   └── __tests__/
├── store/               # Zustand stores (if needed)
├── utils/               # Logic, parsers, rule engines
└── types.ts
```

The `editor-workspace` feature is the largest (~92 components, ~35 hooks).

## Key Patterns

**UI Components:**
- Radix UI primitives in `src/components/ui/`, styled with Tailwind + CVA (`cva()`)
- `cn()` utility (clsx + tailwind-merge) for class composition
- `forwardRef` + `asChild` (Slot) pattern on shared components

**State Management:**
- Server state: TanStack Query with hierarchical `queryKeys` per hook
- Global UI: Zustand stores (`auth-store`, `tabs-store`, `pricing-overlay-store`)
- Auth store persists via `sessionStorage` middleware (clears on browser close)

**Data Fetching:**
- Metadata queries use `staleTime: 5min`, `gcTime: 30min`
- Custom `queryKeys` objects for fine-grained cache invalidation (e.g., `metadataQueryKeys.folders(tenantId, eid)`)

**Toasts:** Sonner — use `toast.error()` / `toast.success()`

## Gotchas

- **Preview mode:** `vite --mode preview` swaps App + services to `preview/` versions for a demo mode.
- **Dev proxy:** `/api/*` requests proxy to `http://127.0.0.1:3000` (the API).
- **Solar Icons stubbed in tests:** `@solar-icons/react` is aliased to `src/test/stubs/solar-icons.tsx` to avoid bundling the icon library in tests.
- **MSW for test mocking:** HTTP mocks via Mock Service Worker in `src/test/mocks/`. Tests override default handlers as needed.
- **Feature gates:** `<FeatureGate>` component conditionally renders premium badges based on tenant features.
- **Error toast deduplication:** `EditorWorkspacePage` uses `useRef` to prevent toast spam.

## Test Setup

- **Framework:** Vitest + jsdom + @testing-library/react
- **Setup file:** `src/test/setup.ts` (MSW listeners + window mocks)
- **Stubs:** Factory functions in `src/test/stubs/` (`createUserStub`, `createTenantStub`)
- **Pattern:** Create a fresh `QueryClient({ defaultOptions: { queries: { retry: false } } })` per test
- **Cache seeding:** Use `queryClient.setQueryData()` to pre-populate cache in tests
