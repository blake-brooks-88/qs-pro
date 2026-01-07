# 02 — Editor Workspace

## Goal

Implement the main Query++ IDE experience.

## Assets

- `sections/editor-workspace/components/` — props-based components
- `sections/editor-workspace/types.ts` — TypeScript interfaces + callback contract
- `sections/editor-workspace/sample-data.json` — realistic sample data

## Requirements

- Use `@solar-icons/react` for icons (no `lucide-react`)
- Keep components props-based; wire navigation/side effects via callbacks

## Work Breakdown

1. Render `EditorWorkspace` inside your shell/app layout.
2. Replace sample data with real sources (API + state management) while keeping the same prop shapes.
3. Wire callbacks:
   - `onRun` to your execution endpoint
   - `onSave` / `onSaveAs` to persistence
   - `onCreateDE` / DE modal to DE creation API
   - `onCreateQueryActivity` to Automation Studio activity creation
4. Ensure empty states and error states are handled (no blank UI).
5. Add tests per `sections/editor-workspace/tests.md`.

