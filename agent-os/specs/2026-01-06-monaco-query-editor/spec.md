# Specification: Monaco Query Editor

## Goal
Deliver a Monaco-based SQL editor that feels like a full IDE while enforcing Marketing Cloud SQL guardrails and context-aware autocomplete to prevent invalid runs.

## User Stories
- As an MCE Architect, I want intelligent autocomplete and linting so I can write valid queries faster and avoid runtime failures.
- As a Campaign Manager, I want IDE-like editing comforts so I can work confidently without switching tools.

## Specific Requirements

**Monaco editor foundation**
- Use Monaco Editor as the core editor engine.
- No minimap.
- Preserve existing editor layout inside the Editor Workspace.

**IDE editing comforts**
- Auto-pairs for quotes, brackets, parentheses, braces, and other common auto pair characters with cursor inside.
- Line numbers, code folding, smart indent, and find/replace.
- Vertical ruler at 100 columns.
- VS Code-style keybindings for common actions (find, find/replace, multi-cursor).

**Syntax highlighting and theme tokens**
- Distinct styles for SQL keywords, string literals, and Data Extension names.
- If new colors are needed, add them to Tailwind using the semantic token convention.

**Data Extension autocomplete**
- Trigger DE suggestions on FROM/JOIN.
- Use the existing metadata cache with fuzzy matching on DE names.
- Suggestions are alphabetical.
- Selecting or tabbing inserts ENT.[DEName] for shared/parent BU DEs.

**Bracket insertion behavior**
- Insert [] with the cursor inside after typing SELECT or JOIN to guide DE entry.
- When choosing a DE from autocomplete, always insert brackets with the cursor inside.

**Field autocomplete and scoping**
- Trigger field suggestions on alias + '.' and when typing fields for a selected DE.
- Load fields on demand via existing fields API when a DE name is detected.
- Respect subquery scoping so outer queries only see child query output aliases.
- Suggestions show FieldName - DataType (example: EmailAddress - Text(254)).

**Guardrails and linting**
- Block RUN on prohibited keywords: UPDATE, DELETE, INSERT, DROP, ALTER, TRUNCATE, MERGE.
- Block RUN on CTE usage (WITH ... AS (...)) and temp tables (#TempTable).
- Block RUN on procedural SQL: DECLARE, SET, WHILE, PRINT, GO.
- Match whole words only to avoid false positives in DE names.

**Diagnostics and feedback**
- Errors: red squiggles; warnings: yellow squiggles.
- Tooltips explain the issue and identify the line/segment causing it.
- DE names with spaces must trigger a warning until wrapped in brackets.
- Any diagnostic that would cause MCE failure blocks RUN.

**Run gating**
- RUN is disabled (or triggers a blocking modal) until the query is linted and valid.

## Visual Design
No visual assets provided.

## Existing Code to Leverage

**Editor layout and controls: `apps/web/src/features/editor-workspace/components/EditorWorkspace.tsx`**
- Reuse the current editor pane layout, toolbar, and tab management UI.
- Extend guardrail messaging patterns already displayed in the workspace.

**Metadata hooks: `apps/web/src/features/editor-workspace/hooks/use-metadata.ts`**
- Reuse metadata cache query keys and fetch helpers for DE lists.
- Reuse fields-on-demand query behavior for field autocomplete.

**Sidebar data extensions: `apps/web/src/features/editor-workspace/components/WorkspaceSidebar.tsx`**
- Follow existing sorting and lazy field loading behavior.
- Reuse DataExtension and DataExtensionField shapes.

**Metadata service: `apps/api/src/mce/metadata.service.ts`**
- Leverage cached SOAP retrieval for folders, data extensions, and fields.

**Metadata endpoints: `apps/api/src/mce/metadata.controller.ts`**
- Use existing /metadata/folders, /metadata/data-extensions, and /metadata/fields endpoints.

## Out of Scope
- Actually running queries.
- Prettyfiying or auto-formatting SQL.
- Creating Data Extensions from queries.
