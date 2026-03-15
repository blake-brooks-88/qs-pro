import { z } from "zod";

export const SnippetScopeSchema = z.enum(["bu", "tenant"]);
export type SnippetScope = z.infer<typeof SnippetScopeSchema>;

export const CreateSnippetSchema = z.object({
  title: z.string().min(1).max(255),
  triggerPrefix: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[a-zA-Z][a-zA-Z0-9]*$/,
      "Trigger prefix must start with a letter and contain only alphanumeric characters",
    ),
  code: z.string().min(1).max(100000),
  description: z.string().max(1000).optional(),
  scope: SnippetScopeSchema.optional().default("bu"),
});

export const UpdateSnippetSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  triggerPrefix: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[a-zA-Z][a-zA-Z0-9]*$/,
      "Trigger prefix must start with a letter and contain only alphanumeric characters",
    )
    .optional(),
  code: z.string().min(1).max(100000).optional(),
  description: z.string().max(1000).nullable().optional(),
  scope: SnippetScopeSchema.optional(),
});

export const SnippetResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  triggerPrefix: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  scope: SnippetScopeSchema,
  createdByUserName: z.string().nullable(),
  updatedByUserName: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const SnippetListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  triggerPrefix: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  scope: SnippetScopeSchema,
  createdByUserName: z.string().nullable(),
  updatedByUserName: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateSnippetDto = z.infer<typeof CreateSnippetSchema>;
export type UpdateSnippetDto = z.infer<typeof UpdateSnippetSchema>;
export type SnippetResponse = z.infer<typeof SnippetResponseSchema>;
export type SnippetListItem = z.infer<typeof SnippetListItemSchema>;
