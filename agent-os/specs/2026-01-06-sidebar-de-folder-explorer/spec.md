# Specification: Sidebar DE Folder Explorer

## Goal
Provide a fast, minimal Data Extension explorer in the left sidebar that lazy-loads folders and fields so users can browse schema without slowing initial load.

## User Stories
- As an MCE architect, I want to expand folders and DEs to see fields so that I can confirm schema details while writing queries.
- As a campaign manager, I want the sidebar to load quickly with expandable folders so that I can browse data without long waits.

## Specific Requirements

**Sidebar placement and structure**
- Use the existing left sidebar in the editor workspace (no activity bar).
- Keep the sidebar collapse/expand toggle behavior intact.
- Show the Data tab as the primary place for this explorer; leave the Queries tab behavior unchanged.
- Do not render a search input in this iteration.

**Folder tree lazy loading**
- Load only root-level folders on initial render.
- Expanding a folder fetches its direct child folders and DEs if not cached.
- Child folders are collapsed by default after they appear.
- Show a minimal per-folder loading indicator during fetch.

**Ordering and grouping**
- Within each folder, list subfolders first, then DEs.
- Sort subfolders and DEs alphabetically by name (case-insensitive).
- Preserve hierarchy using parent folder IDs and DE category IDs.

**Data Extension nodes**
- DE nodes are collapsed by default and display only the DE name.
- Expanding a DE fetches fields by customer key when not cached.
- Field rows display field name and field type only.
- Do not show primary key or required indicators.

**Typography and visual styling**
- Render field type text using the JetBrains Mono stack (e.g., `font-mono`).
- Use the existing Tailwind theme tokens and spacing scale.
- Keep visuals minimal and consistent with the Zen sidebar aesthetic.

**Data fetching and state management**
- Use TanStack Query for server state and caching; use local state for expansion toggles.
- Reuse existing metadata endpoints: folders, data extensions, and fields.
- Cache folder/field responses to avoid duplicate network calls on re-expand.
- Share DE list and DE field caches between the sidebar explorer and future autocomplete to prevent redundant fetches.
- Prefer a single set of query keys (e.g., by tenant/eid and customer key) as the central in-memory store for metadata.

**Accessibility**
- Use button elements for expand/collapse controls.
- Include `aria-expanded` on expandable nodes and keep focus states visible.

## Existing Code to Leverage

**`apps/web/src/features/editor-workspace/components/WorkspaceSidebar.tsx`**
- Provides the left sidebar layout, tab switcher, and collapse behavior.
- Contains current folder/DE tree rendering that can be adapted for lazy loading.
- Uses Solar Icons and existing spacing/typography conventions.

**`apps/web/src/features/editor-workspace/hooks/use-metadata.ts`**
- Centralizes metadata fetching and normalization logic.
- Maps folder and DE responses into `Folder` and `DataExtension` types.
- Can be extended or replaced with TanStack Query for lazy requests.

**`apps/web/src/features/editor-workspace/types.ts`**
- Defines `Folder`, `DataExtension`, and `DataExtensionField` shapes.
- Establishes field type enums and DE/customer key structure.

**`apps/api/src/mce/metadata.controller.ts` / `apps/api/src/mce/metadata.service.ts`**
- Exposes folders, data extensions, and fields endpoints already in use.
- Includes caching behavior for folders and fields.

**`apps/web/src/features/editor-workspace/EditorWorkspacePage.tsx`**
- Wires tenant `eid` into metadata fetching and renders the editor workspace.
- Current entry point for the sidebar data flow.

## Out of Scope
- Search within the sidebar
- Favorites or pinning
- Drag-and-drop reordering
- Inline renaming
- Context menus
- Bulk expand/collapse
- Count badges for folders
