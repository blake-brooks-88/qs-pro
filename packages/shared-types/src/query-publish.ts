import { z } from "zod";

// --- Publish API ---

export const PublishQueryRequestSchema = z.object({
  versionId: z.string().uuid(),
});
export type PublishQueryRequest = z.infer<typeof PublishQueryRequestSchema>;

export const PublishQueryResponseSchema = z.object({
  publishEventId: z.string().uuid(),
  versionId: z.string().uuid(),
  savedQueryId: z.string().uuid(),
  publishedSqlHash: z.string(),
  publishedAt: z.string().datetime(),
});
export type PublishQueryResponse = z.infer<typeof PublishQueryResponseSchema>;

// --- Drift Detection ---

export const DriftCheckResponseSchema = z.object({
  hasDrift: z.boolean(),
  localSql: z.string(),
  remoteSql: z.string(),
  localHash: z.string(),
  remoteHash: z.string(),
});
export type DriftCheckResponse = z.infer<typeof DriftCheckResponseSchema>;

// --- Publish Events List ---

export const PublishEventListItemSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  savedQueryId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type PublishEventListItem = z.infer<typeof PublishEventListItemSchema>;

export const PublishEventsListResponseSchema = z.object({
  events: z.array(PublishEventListItemSchema),
  total: z.number().int(),
});
export type PublishEventsListResponse = z.infer<
  typeof PublishEventsListResponseSchema
>;

// --- Blast Radius ---

export const AutomationInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.string(),
  isHighRisk: z.boolean(),
});
export type AutomationInfo = z.infer<typeof AutomationInfoSchema>;

export const BlastRadiusResponseSchema = z.object({
  automations: z.array(AutomationInfoSchema),
  totalCount: z.number().int(),
  // Optional metadata indicating the response may be incomplete due to upstream
  // failures (e.g. partial automation detail fetch).
  partial: z.boolean().optional(),
  detailRequests: z.number().int().nonnegative().optional(),
  detailFailures: z.number().int().nonnegative().optional(),
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponseSchema>;
