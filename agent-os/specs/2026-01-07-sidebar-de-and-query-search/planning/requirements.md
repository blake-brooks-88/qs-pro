# Spec Requirements: Sidebar DE and Query Search

## Initial Description
7b. [ ] **Sidebar DE search (Frontend)** — Enable users to search for DEs in the sidebar by leveraging the metadata cache. capture the category ID from the DEs that were returned, then use that to figure out the category that DE belongs to, expand all of its parents and filter the DE/folder results so you just see that DE with all of its parent folders expanded. `M`

we also need a resuable search bar component for the sidebar that searches for DEs or Queries based on the active tab

## Requirements Discussion

### First Round Questions

**Q1:** I assume the sidebar search is a single reusable component that swaps behavior based on the active tab (e.g., “Data Extensions” vs “Queries”). Is that correct, or do you want separate search UIs per tab?
**Answer:** Yes, shared component.

**Q2:** For the DE tab: I’m assuming we search only against the existing metadata cache (no network calls), and results are DEs (not folders). Is that correct, or should it also match folder names and/or trigger a background refresh when cache is stale?
**Answer:** Correct (DEs only for now). If possible, write it in a way that could search for both later, but YAGNI.

**Q3:** When a DE match is selected (or when there’s exactly one match), I’m assuming we “focus” the tree by expanding the full parent folder chain, showing only that DE and its parent folders (expanded), while keeping the rest hidden until the search is cleared. Is that the intended UX, or do you want a results list separate from the tree?
**Answer:** Yes. It should work like a filter: hide anything not related to that DE except its parent folder tree.

**Q4:** If multiple DEs match, I’m assuming we show a results list (name + folder path) and selecting one performs the expand+filter behavior for that DE. Is that correct, or should we expand+filter to all matched DEs at once?
**Answer:** MCE doesn’t allow duplicate DE names. Show matching DEs in a search results popover, but only apply the filter when the user confirms (click or Enter). On confirm, leverage the metadata cache to store info and reuse it next search to avoid another API call.

**Q5:** Category resolution: I’m assuming each DE result includes a `CategoryID`, and the folder metadata cache includes parent pointers so we can compute ancestors deterministically. Is that already available in the cache, or do we need an additional mapping step/source of truth?
**Answer:** Believed to be available, but needs investigation in the existing code.

**Q6:** Scope: I’m assuming search includes both “current BU” and “shared/parent BU” DEs if both are present in the sidebar explorer. Is that correct, or should search be limited to the currently selected BU scope?
**Answer:** Search all folders that render. Today: BU DEs + Shared DE folders. Future: more sources may be added; search should include all loaded into the metadata cache.

**Q7:** For the Queries tab: I’m assuming “queries” means your saved queries explorer (and possibly snippet library items if that’s also in the sidebar). Which objects should be searchable here, and what fields (name only vs name + SQL content)?
**Answer:** “Queries” means all available saved queries. Not hooked up to the DB yet, but eventually loaded on project load via the proper abstraction layers (services/repositories), so the search should work against that set.

**Q8:** What’s explicitly out of scope for this iteration (e.g., full-text SQL search, cross-tab global search, keyboard-driven tree navigation, highlighting matches in the tree)?
**Answer:** Any API calls for the query side; just wire search so it works when the eventual “retrieve all saved queries” API is available.

### Existing Code to Reference
No similar existing features identified for reference.

### Follow-up Questions

**Follow-up 1:** When the user presses `Enter` with multiple DE matches, should we auto-confirm the top match, or require an explicit selection (click / arrow+enter)?
**Answer:** Explicit selection required. Support standard keyboard shortcuts for the search UI.

**Follow-up 2:** After a DE is “confirmed” and the tree is filtered to that DE + its parent folders, should the user be able to keep expanding within that subtree (e.g., sibling folders under the same parents), or should it be strictly locked until they clear the search?
**Answer:** They should be able to expand siblings, but only within what remains visible after filtering. Only the root -> parent chain stays visible; “aunt/uncle” folders (at levels above but not in the direct parent chain) should not show.

**Follow-up 3:** You mentioned “filtering and API call structure” on confirm: what data are we allowed/expected to fetch at that moment (only missing folder ancestors + DE row in cache, or also DE fields, etc.)? If “no API call is needed when cache is complete”, is that the intended behavior?
**Answer:** API calls needed are to retrieve the folder structure (ideally only one call). It may be better if the metadata cache can return the entire folder structure rather than only parent-level folders; user asked whether that is a sensible change and whether it would make search easier.

**Follow-up 4:** When clearing the search, should we restore the previous expand/collapse state from before searching, or reset to the default collapsed state?
**Answer:** Restore previous expand/collapse state.

## Visual Assets

No visual assets provided.

## Requirements Summary

### Functional Requirements
- Provide a reusable sidebar search component that changes behavior based on the active tab (DEs vs Queries).
- DE tab search:
  - Search against the metadata cache for Data Extensions (DEs) (no folder search for now).
  - Display matches in a popover results list with standard keyboard shortcuts.
  - Require explicit selection to confirm and apply search (click or Enter after selection).
  - On confirm, filter the sidebar tree to show only the selected DE and its direct ancestor folder chain (root -> parents), expanded.
  - Within the filtered view, allow expanding siblings inside the visible subtree; do not show “aunt/uncle” folders outside the direct ancestor chain.
  - Clearing the search restores the previous expand/collapse state.
- Queries tab search:
  - Search across the set of available saved queries loaded on project load (via service/repository abstractions when implemented).
  - No query-side API calls in this iteration.
- UI constraint: use Solar icons.

### Reusability Opportunities
- Implement the search UI as a “dumb” reusable component using CVA with variants, extended by the sidebar for DE/Query-specific behavior.
- Write DE search logic so it can be extended later (e.g., optionally include folder name search), while keeping current scope minimal (YAGNI).

### Scope Boundaries
**In Scope:**
- Sidebar search bar component with CVA variants.
- DE search against metadata cache with explicit confirm -> filter + expand behavior.
- Store and reuse search-derived folder/DE context in the metadata cache to avoid repeat API calls when possible.
- Queries tab search UI wiring against an in-memory list of queries (once available).

**Out of Scope:**
- Any query-side API calls (until the “retrieve all saved queries” API exists).
- Full-text SQL/content search (beyond whatever fields are available for “queries” initially).

### Technical Considerations
- Metadata prerequisites need investigation: confirm whether DE results include `CategoryID` and whether folder metadata provides parent pointers sufficient to compute ancestors.
- Folder structure retrieval on confirm: preference is a single call if needed; explore whether adjusting the metadata cache to return the entire folder structure (vs parent-level only) simplifies search and reduces calls.
