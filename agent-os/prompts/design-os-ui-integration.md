# Prompt — Integrate Design OS UI into qs-pro

You are working in the **qs-pro** monorepo.

Goal: integrate UI components exported from Design OS (Query++ workspace designs) into the real `@qpp/web` frontend in a controlled, incremental way.

## Context

- `@qpp/web` is a Vite + React app located at `apps/web`.
- Design OS exports a handoff package called `product-plan/`.
- Treat `agent-os/product-plan/` as a **read-only snapshot**. Do not edit it directly.
- Implement production code in `apps/web/src/...`.

## Non-negotiables

- **Icons:** use `@solar-icons/react` only. Do not add/use `lucide-react`.
- **Path alias:** `@` must resolve to `apps/web/src` for both TS + Vite.
- **UI primitives:** use the existing shadcn-style primitives under `apps/web/src/components/ui/*`.

## Verify/Setup (must do first)

1. **Solar icons dependency**
   - Ensure `@solar-icons/react` is installed in `@qpp/web`.
   - Remove any usage of `lucide-react`.
   - ESLint should fail on any `lucide-react` import.

2. **Path aliases**
   - TypeScript: `apps/web/tsconfig.json` should include:
     - `"baseUrl": "."`
     - `"paths": { "@/*": ["./src/*"] }`
   - Vite: `apps/web/vite.config.ts` should include `resolve.alias` mapping `@` to `./src`.

3. **UI primitives alignment**
   - Exported components assume these imports exist:
     - `@/components/ui/button`
     - `@/components/ui/dialog`
     - `@/lib/utils` (for `cn`)
   - Confirm these files exist in `apps/web/src` and keep them as the source of truth.

## How to integrate the exported components

Assume the exported snapshot lives at `agent-os/product-plan/`.

1. Create a feature folder in the real app, for example:
   - `apps/web/src/features/editor-workspace/`
   - `apps/web/src/features/editor-workspace/components/`

2. Copy the exported components from:
   - `agent-os/product-plan/sections/editor-workspace/components/*`
   into:
   - `apps/web/src/features/editor-workspace/components/*`

3. Update any imports if needed so they target the real app’s primitives:
   - Keep `@/components/ui/*` and `@/lib/utils` imports.

4. Create a route/page that renders the workspace behind auth/iframe constraints.

## Suggested incremental rollout (match roadmap)

- **Sidebar & Schema Explorer first:** render `WorkspaceSidebar` with real metadata query hooks; stub the rest.
- **Results viewer next:** wire `ResultsPane` to your streaming API.
- **Deployment last:** wire `QueryActivityModal` to your backend “save activity” endpoint.

## Guardrails

- Avoid introducing new UI dependencies without asking.
- No `console` statements (repo rule).
- No `any` in new code.

