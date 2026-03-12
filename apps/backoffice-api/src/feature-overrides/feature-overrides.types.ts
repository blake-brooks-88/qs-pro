import { z } from "zod";

export const SetOverrideSchema = z.object({
  enabled: z.boolean(),
});

export type SetOverrideDto = z.infer<typeof SetOverrideSchema>;
