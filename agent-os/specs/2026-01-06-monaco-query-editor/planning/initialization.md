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
