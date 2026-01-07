# Spec Requirements: Monaco Query Editor

## Initial Description
I want to work on fleshing out the monaco query editor section. here are some core items we need
5.1. The Editor Workspace (Core)
	•	FR-1.1 Monaco Engine: Utilize the Monaco Editor engine for minimap, multi-cursor editing, and syntax highlighting.
	•	FR-1.2 Syntax Highlighting: SQL keywords must be distinct from string literals. DE names must be highlighted as well. if we need more colors added to the tailwind config file do so, but it must follow our semantic token convention
	•	FR-1.3 Intelligent Autocomplete:
	•	Trigger: FROM / JOIN triggers Data Extension (DE) list.
	•	Context: alias. triggers fields for that specific table.
	•	Display: Show Field Name + Data Type (e.g., EmailAddress - Text(254)).
5.2. Intelligent Guardrails (New - The "Linter")
	•	FR-2.1 Restricted Command Blocker:
	•	Constraint: The RUN button must be disabled (or trigger a blocking modal) if the editor contains prohibited keywords: UPDATE, DELETE, INSERT, DROP, ALTER, TRUNCATE, MERGE or any CTE Logic.
	•	Feedback: Highlight these keywords in RED with a tooltip: "Not Supported: SFMC SQL only supports SELECT. Use the 'Run to Target' wizard for updates."
	•	FR-2.2 Procedural SQL Ban:
	•	Constraint: Flag usage of T-SQL procedural elements: DECLARE, SET, WHILE, PRINT, GO.
	•	Feedback: Tooltip: "Variables and loops are not supported in Marketing Cloud."
	•	FR-2.3 Temp Table & CTE Detection:
	•	Constraint: Detect #TempTable or WITH x AS (...) syntax.
Feedback: Warn user: "Temp tables and CTEs are not officially supported and may cause failures. Use Subqueries instead."
5.3 autocomple
fr-3.1 must use metadata cache to allow for DE auto complete based on fuzzy match names. resultes should be in alphabetical order
constraint: DE’s in the shared/parent BU must be prefixed with ‘ENT.’ all DEs when tabbed must be put in brackets []
fr-3.2 table alias folllowed by period must offer autocomplete when users use the alias followed by a .

this text editor needs to feel exaclty like every other text editor with all of the creature comforts people expect. auto creating closing ‘, “, (, {, etc with the cursor in the midde of them. we need to have line numbers, we can also have a vertical line stating when a query “should” end due to conventions of code line length. what creature comforts am  I missing? what should we add? I want this to feel like someone is using a full fledged IDE

the query must be linted and valid before it’ll let someone run it

## Requirements Discussion

### First Round Questions

**Q1:** I’m assuming the Run button is enabled only when the linter has zero blocking issues; should warnings (like temp tables/CTEs) still allow Run, or should any warning block execution?
**Answer:** yes exactly. no, warnings like that should block as well. basically if marketing cloud will throw an error, we need to prevent it before they can run. perhaps a tooltip could highlight parts of the code that are causing the error and the line they're on?

**Q2:** I’m assuming prohibited keywords (UPDATE/DELETE/INSERT/DROP/ALTER/TRUNCATE/MERGE) and procedural SQL (DECLARE/SET/WHILE/PRINT/GO) should always block Run and show red highlights + tooltips; should these be case-insensitive and match whole words only?
**Answer:** yes exactly. some people may have those words in DE names though so we need to make sure that we only prevent those exact words as is

**Q3:** I’m thinking CTE detection should treat `WITH ... AS (...)` as blocked (not just warned). Is that correct, or do you want it to warn only?
**Answer:** yes it should be blocking

**Q4:** For autocomplete, I’m assuming we use the existing metadata cache with fuzzy matching on DE names, return results alphabetically, and cap results (e.g., 50) for performance. Is that correct, or should the cap/ordering be different?
**Answer:** yes exactly we must use the existing cache. not sure what you mean by capping the results tbh. are you saying the ones that show up as a match? whatever is reasonable I'm okay with

**Q5:** For shared/parent BU DEs, I’m assuming we always prefix with `ENT.` in the suggestion label and insert `[ENT.DEName]` on tab; should we also apply brackets when users click/select (not just tab)?
**Answer:** no it's actually ENT.[DEName] yes. when someone clicks on it they should do that as well. we should also make it so when someone uses select it auto adds [] after it with the cursor in the middle for the DE name

**Q6:** For alias-based autocomplete, I’m assuming we only suggest fields after a recognized alias + `.` that comes from a valid `FROM/JOIN` clause; should we also infer aliases for bracketed names or quoted identifiers?
**Answer:** yes exactly. we need to be mindful of subqueries too. those could potetnially be multiple levels deep and the outer query will only have access to the child query as far as I'm aware

**Q7:** For “full IDE feel,” I’m assuming VS Code–style keybindings with auto-pairs, smart indent, code folding, multi-cursor, find/replace, line numbers, minimap, and a line-length ruler at 100 columns. Which of these are required, and what else should be included?
**Answer:** Yes please. we don't need the minimap. the rest is great

**Q8:** What should be explicitly out of scope for this editor work right now?
**Answer:** out of scope
- actually running the query
- prettyfiying the query
- creating a DE from the query, etc.

### Existing Code to Reference

**Similar Features Identified:**
- Feature: Metadata cache and fields-on-demand lookup - Path: `apps/api/src/mce/metadata.service.ts`
- Components to potentially reuse: metadata cache for DE autocomplete; fields-on-demand fetch for DE field suggestions
- Backend logic to reference: API call that loads fields when a DE is typed and the user requests field autocomplete

### Follow-up Questions

**Follow-up 1:** What column width should the vertical ruler use (e.g., 100, 120), or should we align it to an existing code style standard?
**Answer:** we should probably just do 100 characters

**Follow-up 2:** For bracket behavior, do you want: (a) normal auto-pairs for `[` anywhere, and (b) auto-insert `[]` only when inserting a DE via autocomplete (FROM/JOIN), or should `[]` be inserted right after typing `SELECT` as a placeholder? Also, should a DE name with spaces block Run until it’s bracketed?
**Answer:** yes auto pairs for sure. to be kind to users though we should auto start brackets after they type select or do a join

**Follow-up 3:** Can you point me to the file paths for the metadata cache and the API call that loads DE fields on demand?
**Answer:** apps/api/src/mce/metadata.service.ts

## Visual Assets

### Files Provided:
No visual assets provided.

### Visual Insights:
No visual insights available (no files provided).

## Requirements Summary

### Functional Requirements
- Monaco-based editor with multi-cursor, syntax highlighting, line numbers, auto-pairs (quotes/parens/braces/brackets with cursor inside), smart indent, code folding, find/replace, and line-length ruler at 100 columns; no minimap.
- Syntax highlighting must differentiate SQL keywords, string literals, and DE names; if additional colors are needed, add them to Tailwind following the semantic token convention.
- Autocomplete must use the existing metadata cache with fuzzy matching on DE names and return results alphabetically.
- FROM/JOIN triggers DE suggestions; selecting or tabbing inserts `[]` with cursor inside; for shared/parent BU DEs, insert `ENT.[DEName]`.
- After typing SELECT or JOIN, auto-insert `[]` to help users enter a DE name.
- Alias-based autocomplete triggers after alias + `.` and should respect subquery scoping; outer query sees only the subquery alias scope.
- Field autocomplete must show `Field Name - Data Type` and load DE fields on demand when a DE is typed, via the existing fields API.
- Linter must block Run when prohibited keywords, procedural SQL, CTEs, or temp table syntax are present; warnings that would fail in MCE also block Run.
- Highlight errors with red squiggles and warnings with yellow squiggles; tooltips should explain the issue and identify the line/segment causing it.
- DE names with spaces should trigger a warning and must be wrapped in brackets.

### Reusability Opportunities
- Reuse metadata cache logic for DE name autocomplete.
- Reuse existing fields-on-demand API in `apps/api/src/mce/metadata.service.ts` for DE field suggestions.
- Follow existing metadata lookup patterns in the MCE metadata service.

### Scope Boundaries
**In Scope:**
- Monaco editor configuration and UX enhancements (auto-pairs, keybindings, folding, find/replace, line-length ruler).
- Autocomplete for DEs and fields, including alias-aware suggestions and ENT prefix handling.
- Linting/guardrails with blocking behavior, squiggle feedback, and tooltips.

**Out of Scope:**
- Actually running the query.
- Prettyfiying the query.
- Creating a DE from the query.

### Technical Considerations
- Keyword blocking should match whole words to avoid false positives in DE names.
- Alias and subquery parsing should support multiple nested levels.
- Use metadata cache for fuzzy DE lookups and on-demand field retrieval when users request field autocomplete.
- Ensure ENT prefix formatting is `ENT.[DEName]` and bracket insertion happens on both click and tab selection.
- The query must be linted and valid before enabling Run.
