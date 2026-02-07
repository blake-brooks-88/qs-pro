import { z } from "zod";

export const UsageResponseSchema = z.object({
  queryRuns: z.object({
    current: z.number(),
    limit: z.number().nullable(),
    resetDate: z.string(),
  }),
  savedQueries: z.object({
    current: z.number(),
    limit: z.number().nullable(),
  }),
});

export type UsageResponse = z.infer<typeof UsageResponseSchema>;
