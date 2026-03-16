import { z } from "zod";

/**
 * Audit event type taxonomy using dot notation (resource.action).
 * Defined as a TypeScript type (not Zod enum) for extensibility —
 * new phases add event types without modifying existing schemas.
 */
export type AuditEventType =
  // Auth
  | "auth.login"
  | "auth.logout"
  | "auth.session_expired"
  | "auth.oauth_refreshed"
  // Saved queries
  | "saved_query.created"
  | "saved_query.updated"
  | "saved_query.deleted"
  // Folders
  | "folder.created"
  | "folder.updated"
  | "folder.deleted"
  | "folder.moved"
  | "folder.shared"
  // Query activities
  | "query_activity.created"
  | "query_activity.linked"
  | "query_activity.unlinked"
  | "query_activity.published"
  // Versions
  | "version.restored"
  | "version.renamed"
  // Subscription
  | "subscription.trial_activated"
  | "subscription.trial_expired"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.payment_failed"
  | "subscription.refunded"
  | "subscription.dispute_opened"
  | "subscription.dispute_closed"
  | "subscription.webhook_conflict"
  // Checkout
  | "checkout.expired"
  // Roles
  | "role.changed"
  | "role.ownership_transferred"
  // SIEM
  | "siem.config_updated"
  | "siem.config_deleted"
  // Snippets
  | "snippet.created"
  | "snippet.updated"
  | "snippet.deleted"
  // GDPR / Lifecycle
  | "tenant.soft_deleted"
  | "tenant.restored"
  | "tenant.hard_deleted"
  | "user.deleted"
  | "user.audit_anonymized"
  | "gdpr.data_exported"
  // System
  | "system.sweeper_run"
  | "system.retention_purge";

/**
 * All known audit event types as a runtime array.
 * Useful for validation and documentation.
 */
export const AUDIT_EVENT_TYPES: AuditEventType[] = [
  "auth.login",
  "auth.logout",
  "auth.session_expired",
  "auth.oauth_refreshed",
  "saved_query.created",
  "saved_query.updated",
  "saved_query.deleted",
  "folder.created",
  "folder.updated",
  "folder.deleted",
  "folder.moved",
  "folder.shared",
  "query_activity.created",
  "query_activity.linked",
  "query_activity.unlinked",
  "query_activity.published",
  "version.restored",
  "version.renamed",
  "subscription.trial_activated",
  "subscription.trial_expired",
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "subscription.payment_failed",
  "subscription.refunded",
  "subscription.dispute_opened",
  "subscription.dispute_closed",
  "subscription.webhook_conflict",
  "checkout.expired",
  "role.changed",
  "role.ownership_transferred",
  "siem.config_updated",
  "siem.config_deleted",
  "snippet.created",
  "snippet.updated",
  "snippet.deleted",
  "tenant.soft_deleted",
  "tenant.restored",
  "tenant.hard_deleted",
  "user.deleted",
  "user.audit_anonymized",
  "gdpr.data_exported",
  "system.sweeper_run",
  "system.retention_purge",
] as const;

export const AuditLogItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  mid: z.string(),
  eventType: z.string().max(100),
  actorType: z.enum(["user", "system"]),
  actorId: z.string().uuid().nullable(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AuditLogItem = z.infer<typeof AuditLogItemSchema>;

export const AuditLogListResponseSchema = z.object({
  items: z.array(AuditLogItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AuditLogListResponse = z.infer<typeof AuditLogListResponseSchema>;

export const AuditLogQueryParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(10_000).default(25),
  eventType: z.string().max(100).optional(),
  actorId: z.string().uuid().optional(),
  targetId: z.string().max(255).optional(),
  dateFrom: z.string().datetime().or(z.string().date()).optional(),
  dateTo: z.string().datetime().or(z.string().date()).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(["createdAt", "eventType"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type AuditLogQueryParams = z.infer<typeof AuditLogQueryParamsSchema>;
