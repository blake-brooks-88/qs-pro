# Data Model

## Entities

### SavedQuery
A persistent SQL script that the user has written and saved in the library to prevent data loss.

### Folder
Containers for organizing hierarchical content. This includes both the user's Saved Query library (internal storage) and the Marketing Cloud Data Extension tree (external structure fetched via API).

### DataExtension
Represents a table or data structure in Marketing Cloud. In Query++, these are used for schema exploration, targeting, and autocomplete.

### Field
A specific column within a Data Extension.

### ExecutionResult
The transient outcome of running a query (rows, runtime, status, errors, pagination state).

## Relationships

- **Folder** contains many **SavedQuery** (for the Library tree).
- **Folder** contains many **DataExtension** (for the MCE Data tree).
- **DataExtension** has many **Field**.
- **SavedQuery** produces an **ExecutionResult** when executed.

