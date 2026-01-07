# Specification: Sidebar Search (DEs and Queries)

## Goal
Add a reusable sidebar search component that supports keyboard-friendly search for Data Extensions and Queries, and enables a confirmed DE search to focus/filter the sidebar tree to the selected DE’s ancestor folder chain.

## User Stories
- As an MCE Architect, I want to quickly find a Data Extension in the sidebar so that I can inspect its fields without manually browsing folders.
- As a Campaign Manager, I want to search saved queries in the sidebar so that I can open a query quickly.
- As a user, I want search filtering to be reversible so that I can return to my prior sidebar state after searching.

## Specific Requirements

**Reusable Sidebar Search Component (CVA)**
- Implement a “dumb” reusable search component built with CVA variants (styling + layout only; behavior provided via props).
- Support variants appropriate for sidebar usage (e.g., compact/dense, with/without icon, with/without clear button).
- Expose render/props hooks for a results popover list (to allow DE and Query implementations to supply results and selection behavior).
- Use Solar icons for search/clear affordances.

**Keyboard Accessibility & Standard Shortcuts**
- Full keyboard support: typing updates search term; ArrowUp/ArrowDown moves the active result; Enter confirms selection; Escape closes popover/clears focus as appropriate.
- Do not allow “Enter” to confirm when multiple results exist unless a result is explicitly selected.
- Maintain visible focus indicators and semantic controls (input + button elements) with appropriate ARIA attributes for combobox/listbox patterns.

**DE Search Data Source (Cache-First)**
- Search against the existing metadata cache for Data Extensions only (no folder-name search in this spec).
- Search scope includes all DEs that are rendered in the sidebar (BU DEs + Shared DEs; future sources should be included if loaded into cache).
- Match is by DE name (case-insensitive); assume uniqueness (MCE constraint), but UI still presents a selectable results list.

**DE Search Results Popover**
- Display matches in a popover attached to the search bar (results list shows DE name and folder path when available).
- Selecting a result (click or keyboard) marks it as the confirmed target; confirmation triggers the filter behavior.
- Closing the popover without confirmation must not change the tree state.

**Confirmed DE “Focus Filter” Behavior**
- On confirm, filter the sidebar tree so only the selected DE and its direct ancestor folder chain (root -> parents) remain visible, with that chain expanded.
- Within the filtered view, allow expanding nodes that are within the visible subtree, but do not show siblings of any ancestor folders outside the direct ancestor chain (“aunt/uncle” folders remain hidden).
- Maintain DE expand/collapse behavior for the selected DE (fields remain lazy-loaded on expand as today).

**Restore Previous Tree State**
- Before applying the focus filter, capture the prior expand/collapse state (folders + DEs) and restore it when the search is cleared.
- Clearing the search returns the full tree and restores previous state (not a reset-to-default collapse).

**Folder Structure Retrieval & Caching**
- Confirm whether folder metadata is already fetched as a complete tree (preferred) or lazy-loaded by parent level.
- If currently lazy-loaded, adjust metadata retrieval/caching so the full folder structure needed for ancestor resolution is available with at most one request per context (cache-first for subsequent searches).
- Use the DE’s `CategoryID` (folder/category id) and folder parent pointers to resolve the ancestor chain deterministically.

**Query Search (UI Wiring Only)**
- Provide query search behavior for the Queries tab against the in-memory list of available queries (loaded on app/project load via service/repository abstractions when implemented).
- No query-side API calls in this spec.

**Styling & Icons**
- Follow existing sidebar styling patterns and density.
- Use Solar icons via `@solar-icons/react` for all icons used in the search UI.

## Visual Design
No mockups provided; match existing sidebar styling and interaction patterns.

## Existing Code to Leverage

**`apps/web/src/features/editor-workspace/components/WorkspaceSidebar.tsx`**
- Existing DE/Queries tab layout, folder/DE tree rendering, and expand/collapse state handling to extend with search UI and filtered rendering.

**`apps/web/src/features/editor-workspace/hooks/use-metadata.ts`**
- Existing metadata fetching/mapping for folders and Data Extensions, including `CategoryID` mapping to `folderId`, to support ancestor resolution and cache-first search behavior.

**`apps/web/src/components/ui/input.tsx`**
- Base input styling and focus states for the search field.

**`apps/web/src/components/ui/button.tsx`**
- CVA pattern for variants and consistent interactive styling to replicate for the reusable search component.

## Out of Scope
- Folder-name search (searching folders in addition to DEs).
- Query-side API calls (until “retrieve all saved queries” exists).
- Full-text query content/SQL searching.
- Global search across tabs outside the sidebar context.
- Auto-confirming a top match on Enter without explicit selection when multiple results exist.
