import type { MCEFieldType } from "./types";

/**
 * Maps aggregate function names to their return types.
 * Keys are UPPERCASE for case-insensitive matching.
 */
export const AGGREGATE_TYPE_MAP = new Map<string, MCEFieldType>([
  ["COUNT", "Number"],
  ["SUM", "Number"],
  ["AVG", "Decimal"],
  ["STDEV", "Decimal"],
  ["STDEVP", "Decimal"],
  ["VAR", "Decimal"],
  ["VARP", "Decimal"],
]);

/**
 * Functions that return string/text values.
 * All names are UPPERCASE for case-insensitive matching.
 */
export const STRING_FUNCTIONS = new Set<string>([
  "CONCAT",
  "LEFT",
  "RIGHT",
  "UPPER",
  "LOWER",
  "LTRIM",
  "RTRIM",
  "TRIM",
  "SUBSTRING",
  "REPLACE",
  "STUFF",
  "REVERSE",
  "CHAR",
  "CHARINDEX",
  "LEN",
  "PATINDEX",
  "QUOTENAME",
  "REPLICATE",
  "SPACE",
  "STR",
  "STRING_AGG",
  "FORMAT",
  "CONCAT_WS",
]);

/**
 * Functions that operate on or return date/time values.
 * All names are UPPERCASE for case-insensitive matching.
 *
 * Note: Some date functions (DAY, MONTH, YEAR, DATEPART, DATEDIFF)
 * actually return numeric values. The schema inferrer handles this
 * special case explicitly.
 */
export const DATE_FUNCTIONS = new Set<string>([
  "GETDATE",
  "GETUTCDATE",
  "DATEADD",
  "DATEDIFF",
  "DATENAME",
  "DATEPART",
  "DAY",
  "MONTH",
  "YEAR",
  "EOMONTH",
  "DATEFROMPARTS",
  "DATETIMEFROMPARTS",
  "SYSDATETIME",
  "SYSUTCDATETIME",
  "CURRENT_TIMESTAMP",
  "SWITCHOFFSET",
  "TODATETIMEOFFSET",
]);

/**
 * Functions that return numeric values.
 * All names are UPPERCASE for case-insensitive matching.
 */
export const NUMERIC_FUNCTIONS = new Set<string>([
  "LEN",
  "DATALENGTH",
  "CHARINDEX",
  "PATINDEX",
  "DATEPART",
  "DATEDIFF",
  "DAY",
  "MONTH",
  "YEAR",
  "ISNUMERIC",
  "ABS",
  "CEILING",
  "FLOOR",
  "ROUND",
  "SIGN",
  "SQRT",
  "SQUARE",
  "POWER",
  "LOG",
  "LOG10",
  "EXP",
]);
