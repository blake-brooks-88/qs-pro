import { z } from "zod";

// Request schemas
export const CreateSavedQuerySchema = z.object({
  name: z.string().min(1).max(255),
  sqlText: z.string().min(1).max(100000),
  folderId: z.string().uuid().nullable().optional(),
});

export const UpdateSavedQuerySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sqlText: z.string().min(1).max(100000).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

// Response schema (full query with SQL text)
export const SavedQueryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sqlText: z.string(),
  folderId: z.string().uuid().nullable(),
  linkedQaObjectId: z.string().nullable(),
  linkedQaCustomerKey: z.string().nullable(),
  linkedQaName: z.string().nullable(),
  linkedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// List item schema (no SQL text for listing)
export const SavedQueryListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  folderId: z.string().uuid().nullable(),
  linkedQaCustomerKey: z.string().nullable(),
  linkedQaName: z.string().nullable(),
  linkedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

// Types derived from schemas
export type CreateSavedQueryDto = z.infer<typeof CreateSavedQuerySchema>;
export type UpdateSavedQueryDto = z.infer<typeof UpdateSavedQuerySchema>;
export type SavedQueryResponse = z.infer<typeof SavedQueryResponseSchema>;
export type SavedQueryListItem = z.infer<typeof SavedQueryListItemSchema>;
