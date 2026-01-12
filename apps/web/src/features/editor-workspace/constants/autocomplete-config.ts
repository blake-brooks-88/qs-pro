/**
 * Autocomplete Configuration Constants
 *
 * Defines configuration values for the SQL autocomplete system including
 * SFMC identity fields, trigger characters, and performance tuning parameters.
 */

/**
 * SFMC Identity Fields
 *
 * Standard identity fields used in Salesforce Marketing Cloud Engagement.
 * These fields are commonly used for JOIN conditions and WHERE clauses.
 */
export const SFMC_IDENTITY_FIELDS = [
  "ContactID",
  "SubscriberKey",
  "_ContactKey",
  "PersonContactId",
  "LeadId",
  "ContactKey",
  "EmailAddress",
  "SubscriberID",
] as const;

/**
 * Identity Field Patterns
 *
 * Regular expressions for case-insensitive matching of identity fields.
 * Used to detect identity fields in SQL queries regardless of casing.
 */
export const IDENTITY_FIELD_PATTERNS = SFMC_IDENTITY_FIELDS.map(
  (field) => new RegExp(`^${field}$`, "i"),
);

/**
 * Immediate Trigger Characters
 *
 * Characters that immediately trigger autocomplete suggestions without
 * requiring additional input. Used for structural completions like
 * column access (.), array access ([), and field names (_).
 */
export const IMMEDIATE_TRIGGER_CHARS = [".", "[", "_"] as const;

/**
 * Minimum Trigger Characters
 *
 * Minimum number of characters required before triggering autocomplete
 * suggestions for non-immediate triggers. Reduces noise from single-character
 * inputs while still providing fast feedback.
 */
export const MIN_TRIGGER_CHARS = 2;

/**
 * Maximum Suggestions
 *
 * Maximum number of autocomplete suggestions to display in the dropdown.
 * Limits cognitive load and improves performance for large datasets.
 */
export const MAX_SUGGESTIONS = 10;

/**
 * Ghost Text Debounce
 *
 * Debounce delays (in milliseconds) for ghost text suggestions based on
 * suggestion type:
 * - structural: Immediate (0ms) for syntax/structural completions
 * - dataDependant: Delayed (175ms) for database-dependent completions
 */
export const GHOST_TEXT_DEBOUNCE = {
  structural: 0,
  dataDependant: 175,
} as const;

/**
 * Dropdown Close Characters
 *
 * Characters that trigger automatic closure of the autocomplete dropdown.
 * These typically represent statement boundaries or list separators.
 */
export const DROPDOWN_CLOSE_CHARS = [",", ";", ")", "\n"] as const;

/**
 * No Trigger Characters
 *
 * Characters that should NOT trigger autocomplete suggestions.
 * Includes whitespace, punctuation, and statement separators that
 * don't require completion assistance.
 */
export const NO_TRIGGER_CHARS = [" ", "\n", "\r", ",", ";", ")", "-"] as const;

/**
 * Type helper for immediate trigger characters
 */
export type ImmediateTriggerChar = (typeof IMMEDIATE_TRIGGER_CHARS)[number];

/**
 * Type helper for dropdown close characters
 */
export type DropdownCloseChar = (typeof DROPDOWN_CLOSE_CHARS)[number];

/**
 * Type helper for no trigger characters
 */
export type NoTriggerChar = (typeof NO_TRIGGER_CHARS)[number];

/**
 * Type helper for SFMC identity fields
 */
export type SfmcIdentityField = (typeof SFMC_IDENTITY_FIELDS)[number];
