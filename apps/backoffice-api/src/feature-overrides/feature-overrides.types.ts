import { z } from "zod";

export const SetOverrideSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export type SetOverrideDto = z.infer<typeof SetOverrideSchema>;
