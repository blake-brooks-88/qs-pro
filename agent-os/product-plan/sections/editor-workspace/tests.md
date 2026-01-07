# Editor Workspace — Test Instructions (TDD)

Adapt these to your test stack (Vitest/Jest + Testing Library, Playwright/Cypress, etc.).

## Core Rendering

- Renders the workspace with sidebar, editor area, and results pane.
- Uses light/dark mode tokens without unreadable text.

## Sidebar

- Shows Data vs Queries tabs and switches between them.
- Clicking a saved query calls the `onSelectQuery` callback with the query id.
- Clicking a data extension calls the `onSelectDE` callback with the DE id.

## Run/Results

- Clicking `RUN` calls `onRun('temp')`.
- Results pane renders columns and rows; empty rows show the empty state message.
- Pagination controls call `onPageChange` with correct page numbers and disables at boundaries.

## Create Data Extension Modal

- Clicking “Create Data Extension” opens the modal.
- The field editor renders a “Default” value input column for each field row.
- Creating the DE triggers the modal’s `onSave` with a draft payload (shape is implementation-defined).

## Deploy / Query Activity Modal

- Clicking “Deploy to Automation” opens the Query Activity modal.
- Selecting a target DE and data action enables “Deploy Query Activity”.
- Submitting calls `onCreateQueryActivity` with `{ name, description?, dataAction, targetDataExtensionId }`.

## Guardrails UI (Visual)

- Inline guardrail UI renders when violations exist (error styling present).
- Pre-run blockers (if implemented) prevent executing a run and show a user-visible message/toast.

