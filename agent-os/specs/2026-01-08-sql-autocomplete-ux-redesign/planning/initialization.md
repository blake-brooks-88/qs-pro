# Spec Initialization

## Raw Idea

**Source:** docs/plans/2025-01-08-sql-autocomplete-ux-redesign.md (PRD)

**Description:**
A comprehensive overhaul of the Monaco-based SQL autocomplete system for QS Pro. The goal is to create a "magic-feeling" autocomplete experience that assists without fighting the user's natural typing flow.

### Core Problems to Solve
1. Ghost text appears too aggressively (incorrect JOINs, wrong contexts)
2. Dropdown triggers on spaces, newlines, and non-alphanumeric characters
3. Inconsistent suggestion behavior (appears when unwanted, absent when needed)
4. ENT. tables only showing after `JOIN []` (bug)
5. Alias ghost text not consistently appearing

### Design Philosophy
- **Ghost text** = structural patterns (deterministic, high-confidence)
- **Dropdown** = data completions (tables, columns, functions)
- **Never overlap** - they serve different purposes

### Key Features Outlined in PRD
- Configurable trigger rules (dropdown and ghost text)
- SFMC-specific SQL constraints (SELECT only, supported keywords/functions)
- Smart JOIN condition suggestions with identity field equivalence
- Fuzzy matching with priority ordering
- ENT. table handling improvements
- Expand `*` to column list feature
- Alias auto-suggestion
- Auto-insert behaviors after keyword acceptance

---

**Spec Path:** agent-os/specs/2026-01-08-sql-autocomplete-ux-redesign
