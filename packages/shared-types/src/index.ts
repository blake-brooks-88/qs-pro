import { z } from "zod";

export const EnvVarSchema = z.object({
  PORT: z.string().transform(Number).default("3000"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type EnvVars = z.infer<typeof EnvVarSchema>;
