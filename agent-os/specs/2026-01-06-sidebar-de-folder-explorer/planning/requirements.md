# Spec Requirements: Sidebar DE Folder Explorer

## Initial Description
what does the shell query engine involve again? we just finished setting up the oauth flow. we have the ability to retrieve all DE folders in a BU as well as the ability to retireve all DE names and DE fields based on a customer key.

My thinking was next we could focus on updating the sidebar to load in the DE folder structure to display all of the DEs. the idea would be that the root level folders would be loaded first with a button to expand to see the child folders as well as any DEs inside of that folder

when expanded, the subfolders will also be collapsed by default. the DE will be collapsed by default and just show the name, but expanding the name of the DE will show all of the fields for that DE.

I was thinking we could focus on this first.

## Requirements Discussion

### First Round Questions

**Q1:** I assume this lives in the primary left sidebar "Explorer" area (no separate activity bar), keeping the Zen layout. Is that correct?
**Answer:** yes, this is correct

**Q2:** I'm assuming we load only root folders first, then fetch child folders + DEs on expand. Should root also include DEs that live at the top level, or only folders?
**Answer:** yes we load the root folders first then only other ones on command so we can lazy load

**Q3:** I'm thinking folder nodes show a loading state while expanding. Should we show a count badge for child items, or keep it minimal?
**Answer:** yes they should. keep it minimal no count

**Q4:** For DE nodes, I assume expand shows field name + data type (and length for Text). Should we also show "IsPrimaryKey" or "IsRequired" if available?
**Answer:** just field name and type is fine. jetbrains for the data type please

**Q5:** I assume sorting is folders first, then DEs, both alphabetized. Is that correct, or should we preserve API order / group shared vs BU?
**Answer:** yes, folders first, then DEs alphabatized

**Q6:** Anything explicitly out of scope for this pass (search, favorites, drag/drop, inline rename, context menus, bulk expand)?
**Answer:** search, favorites, drag/drop, inline renaming. none of that stuff.

### Existing Code to Reference

**Similar Features Identified:**
- Feature: section prompt for available components - Path: `agent-os/product-plan/prompts/section-prompt.md`
- Components to potentially reuse: reference section components under `agent-os/product-plan/sections/` per the prompt
- Backend logic to reference: existing DE folder, DE list, and DE fields retrieval already implemented

### Follow-up Questions
No follow-up questions were asked.

## Visual Assets

### Files Provided:
No visual assets provided.

## Requirements Summary

### Functional Requirements
- Render the DE Explorer in the primary left sidebar (no activity bar) consistent with the Zen layout.
- Load root-level DE folders on initial render; fetch child folders and DEs only when a folder is expanded.
- Default collapsed state for subfolders and DE nodes; expand DE to show fields.
- Display DE fields with field name and type only; style the data type using JetBrains.
- Sort folders first, then DEs, alphabetized.
- Show a loading state while expanding folder nodes; keep visuals minimal with no count badges.

### Reusability Opportunities
- Follow the component guidance in `agent-os/product-plan/prompts/section-prompt.md` and its referenced section components.
- Leverage existing DE folder/DE field retrieval logic already implemented.

### Scope Boundaries
**In Scope:**
- Sidebar DE folder tree with lazy-loaded expansion.
- DE node expansion to reveal fields (name + type).
- Folder and DE ordering rules.

**Out of Scope:**
- Search, favorites, drag/drop, inline renaming.
- Context menus and bulk expand.

### Technical Considerations
- Use existing APIs to fetch DE folders, DEs within a folder, and fields by DE customer key.
- Ensure lazy loading to support large BUs.
- Keep the UI minimal and aligned with Zen layout constraints.
