# Editor Workspace Specification

## Overview
The Editor Workspace is the high-performance core of Query++, providing a "Zen Mode" SQL environment. It features a collapsible dual-tab sidebar for resource exploration, a Monaco-powered editor with real-time guardrails, and an intelligent results pane with batched pagination.

## User Flows
- **SQL Development**: User writes SQL in the Monaco editor with autocomplete and formats code using the toolbar button.
- **Data Exploration**: User toggles the sidebar to browse Data Extensions or Saved Queries, searching for specific tables or snippets.
- **On-the-fly DE Creation**: User opens the "Create DE" modal to define a new table (Fields, Types, Primary Keys, Nullable, Retention Policy) without leaving the IDE.
- **Query Configuration & Deployment**: User opens the "Query Settings" modal to select a Target DE, choose a Data Action (Overwrite, Append, Update), and deploys the query to SFMC Automation Studio.
- **Batch Results Review**: User runs a query and navigates through the batched results using intelligent pagination.
- **Real-time Feedback**: User receives immediate feedback via toast notifications for query start, completion, engine errors, and guardrail violations.

## UI Requirements
- **Collapsible Sidebar**: Traditional top-tabs for "Data Extensions" and "Saved Queries" with a search input.
- **Monaco Workspace**: Top-half editor with autocomplete; bottom-half results pane with loading skeletons.
- **Editor Toolbar**: Run (Split-button: Run to Temp / Run to Target), Save, Format, and "Deploy to Automation."
- **Result Actions**: Intelligent pagination (Direct page select + arrows) and a "View in Contact Builder" deep link.
- **Creation Modals**: Multi-row field editor (Name, Type, Length, Primary Key, Nullable) + Retention Policy toggle for DE creation; Searchable Target DE, Data Action selector, and Name/Description fields for Query Settings.
- **Toast Notifications**: Standardized alerts for "Query Started," "Query Successful," "Engine Error," and "Guardrail Blocker" (e.g., prohibited keywords).

## Configuration
- shell: true
