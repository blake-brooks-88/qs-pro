import { z } from "zod";

export const ExecutionHistoryItemSchema = z.object({
  id: z.string().uuid(),
  queryName: z.string().nullable(),
  sqlPreview: z.string().nullable(),
  status: z.enum(["queued", "running", "ready", "failed", "canceled"]),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nullable(),
  rowCount: z.number().int().nullable(),
  targetDeCustomerKey: z.string().nullable(),
  savedQueryId: z.string().uuid().nullable(),
  errorMessage: z.string().nullable(),
  hasSql: z.boolean(),
});
export type ExecutionHistoryItem = z.infer<typeof ExecutionHistoryItemSchema>;

export const RunSqlTextResponseSchema = z.object({
  sql: z.string(),
});
export type RunSqlTextResponse = z.infer<typeof RunSqlTextResponseSchema>;

export const HistoryListResponseSchema = z.object({
  items: z.array(ExecutionHistoryItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type HistoryListResponse = z.infer<typeof HistoryListResponseSchema>;

export const HistoryQueryParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  status: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  queryId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  sortBy: z
    .enum(["createdAt", "durationMs", "rowCount", "status"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type HistoryQueryParams = z.infer<typeof HistoryQueryParamsSchema>;
