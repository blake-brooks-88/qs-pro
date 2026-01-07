# Editor Workspace

## Overview

The core SQL IDE workspace for Query++: a focused editor experience with a left sidebar for Library/Persistence and Data Extensions, inline guardrails, a results pane, and deployment flows.

## Key Flows

- Run SQL to temp results (`Run`)
- Save SQL to library (`Save`)
- Format SQL (`Format`)
- Create Data Extension (modal)
- Create Query Activity / deploy to Automation (modal)
- Browse Saved Queries and Data Extensions in sidebar
- Paginate and inspect results; deep link “View in Contact Builder”

## Components

- `components/EditorWorkspace.tsx` — main workspace layout + toolbar
- `components/WorkspaceSidebar.tsx` — sidebar tabs + search + tree
- `components/ResultsPane.tsx` — results grid + pagination
- `components/DataExtensionModal.tsx` — create DE modal (includes Default Value column)
- `components/QueryActivityModal.tsx` — “Query Settings” / deploy modal (target DE + data action + name/description)
- `components/SaveQueryModal.tsx` — save query dialog
- `components/ConfirmationDialog.tsx` — reusable confirm dialog

