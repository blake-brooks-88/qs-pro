# Marketing Cloud Engagement SQL Reference

## Overview

SFMC SQL is based on SQL Server 2019 with significant restrictions. Marketing Cloud only supports SELECT statements - all data modification operations (INSERT, UPDATE, DELETE) must be performed through the UI or API.

## Supported Operations

### Statements
- SELECT (only supported statement)

### Clauses
- SELECT, FROM, WHERE, JOIN (INNER/LEFT/RIGHT/FULL/CROSS), ON
- GROUP BY (with ROLLUP, CUBE), HAVING, ORDER BY (ASC/DESC)
- UNION, UNION ALL, INTERSECT, EXCEPT
- DISTINCT, TOP

### Operators

#### Comparison
- = (equal)
- != or <> (not equal)
- < (less than)
- > (greater than)
- <= (less than or equal)
- >= (greater than or equal)

#### Logical
- AND
- OR
- NOT

#### Pattern Matching
- LIKE / NOT LIKE
- IN / NOT IN
- BETWEEN
- EXISTS

### Wildcards (LIKE operator)
- `%` - zero or more characters
- `_` - exactly one character
- `[]` - any single character in the set
- `[^]` - any single character NOT in the set

## Supported Functions

### String Functions
| Function | Description |
|----------|-------------|
| LEFT(string, n) | Returns leftmost n characters |
| RIGHT(string, n) | Returns rightmost n characters |
| LEN(string) | Returns length of string |
| CHARINDEX(search, string) | Returns position of search in string |
| PATINDEX(pattern, string) | Returns position of pattern in string |
| CONCAT(s1, s2, ...) | Concatenates strings |
| LTRIM(string) | Removes leading spaces |
| RTRIM(string) | Removes trailing spaces |
| TRIM(string) | Removes leading and trailing spaces |
| LOWER(string) | Converts to lowercase |
| UPPER(string) | Converts to uppercase |
| NEWID() | Generates a unique identifier |
| FORMAT(value, format) | Formats value according to format string |

### Date Functions
| Function | Description |
|----------|-------------|
| GETDATE() | Returns current date/time in server timezone |
| GETUTCDATE() | Returns current date/time in UTC |
| DATEPART(part, date) | Extracts part (year, month, day, etc.) from date |
| DATENAME(part, date) | Returns name of date part |
| YEAR(date) | Extracts year from date |
| MONTH(date) | Extracts month from date |
| DAY(date) | Extracts day from date |
| DATEFROMPARTS(y, m, d) | Constructs date from parts |
| DATETIMEFROMPARTS(...) | Constructs datetime from parts |
| DATEADD(part, n, date) | Adds n units to date |
| DATEDIFF(part, start, end) | Returns difference between dates |
| AT TIME ZONE 'timezone' | Converts to specified timezone |

### Numeric Functions
| Function | Description |
|----------|-------------|
| MIN(column) | Returns minimum value |
| MAX(column) | Returns maximum value |
| AVG(column) | Returns average value |
| SUM(column) | Returns sum of values |
| COUNT(*) | Counts rows |
| COUNT(column) | Counts non-null values |
| COUNT(DISTINCT column) | Counts distinct values |

### Conversion Functions
| Function | Description |
|----------|-------------|
| CAST(value AS type) | Converts value to type |
| CONVERT(type, value [, style]) | Converts with optional style code |

### NULL Handling Functions
| Function | Description |
|----------|-------------|
| IS NULL | Tests for NULL |
| IS NOT NULL | Tests for non-NULL |
| ISNULL(expr, replacement) | Returns replacement if expr is NULL |
| COALESCE(expr1, expr2, ...) | Returns first non-NULL expression |
| NULLIF(expr1, expr2) | Returns NULL if expressions are equal |

### Conditional Functions
| Function | Description |
|----------|-------------|
| CASE WHEN...THEN...ELSE...END | Conditional logic (searched CASE) |
| CASE expr WHEN...THEN...END | Conditional logic (simple CASE) |
| IIF(condition, true_val, false_val) | Inline if/else |

## NOT Supported (Will Cause Errors)

### Data Modification Statements
- INSERT
- UPDATE
- DELETE
- MERGE
- TRUNCATE

### Schema Statements
- CREATE
- DROP
- ALTER

### Execution Statements
- EXEC / EXECUTE
- GRANT
- REVOKE

### Transaction Statements
- BEGIN
- COMMIT
- ROLLBACK
- SAVEPOINT

### Cursor Operations
- CURSOR
- FETCH
- OPEN
- CLOSE
- DEALLOCATE

### Administrative
- BACKUP
- RESTORE
- KILL

### Procedural Keywords
- DECLARE
- SET (variable assignment)
- WHILE
- IF / ELSE
- RETURN
- TRY / CATCH
- THROW
- PRINT
- GO
- RAISERROR
- WAITFOR

### Unsupported Clauses
- WITH (Common Table Expressions)
- LIMIT (use TOP instead)

### OFFSET / FETCH Requirements
- OFFSET and FETCH **are supported** but require ORDER BY
- ORDER BY in subqueries requires TOP or OFFSET (cannot use ORDER BY alone in subquery)

### Column Alias Restrictions
- Column aliases cannot be used in WHERE, HAVING, ORDER BY, or GROUP BY clauses
- Must use the original expression instead of the alias
- Example: Use `ORDER BY CONCAT(first, ' ', last)` instead of `ORDER BY full_name`

### Functions That May Fail
| Function | Reason |
|----------|--------|
| STRING_AGG | Not available in SFMC SQL |
| STRING_SPLIT | Not available in SFMC SQL |
| JSON_MODIFY | JSON functions not supported |
| OPENJSON | JSON functions not supported |
| ISJSON | JSON functions not supported |
| TRY_CONVERT | May not be available |
| TRY_CAST | May not be available |
| TRY_PARSE | May not be available |

## Best Practice Warnings

### Syntax Warnings

| Issue | Recommendation |
|-------|----------------|
| Semicolons (;) | Not required, may cause issues at end of query |
| SELECT * with JOINs | Specify columns explicitly to avoid ambiguous field errors |
| Unbracketed names with spaces/hyphens | Always bracket Data Extension names: `[My Data Extension]` |
| WITH (NOLOCK) | Redundant in SFMC - queries already run in isolation |

### Performance Considerations

- Queries auto-terminate after 30 minutes
- Large data sets should use retention periods or TOP clauses
- Complex JOINs on large Data Extensions may timeout
- Avoid unnecessary columns in SELECT

## Current Lint Rules in QS Pro

| Rule ID | Severity | Description |
|---------|----------|-------------|
| prohibited-keywords | error | Blocks DML/DDL keywords (INSERT, UPDATE, DELETE, etc.) |
| cte-detection | error | Detects WITH...AS patterns (CTEs not supported) |
| select-clause | prereq | Validates SELECT statement presence and structure |
| unbracketed-names | warning | Warns about names that need brackets |
| ambiguous-fields | error | Detects ambiguous field references in JOINs |
| limit-prohibition | error | Blocks LIMIT keyword (use TOP instead) |
| offset-without-order-by | error | OFFSET/FETCH requires ORDER BY clause |
| order-by-in-subquery | error | ORDER BY in subquery requires TOP or OFFSET |
| unsupported-functions | warning | Warns about potentially unsupported functions |
| aggregate-grouping | error | Validates GROUP BY requirements for aggregates |
| comma-validation | error | Detects invalid comma usage (trailing, leading, double) |
| alias-in-clause | error | Detects column aliases used in WHERE/HAVING/ORDER BY/GROUP BY |

## References

- [Mateusz Dąbrowski's SFMC SQL Guide](https://mateuszdabrowski.pl/docs/sql/)
- [Salesforce Marketing Cloud Documentation](https://help.salesforce.com/s/articleView?id=sf.mc_as_sql_reference.htm)
