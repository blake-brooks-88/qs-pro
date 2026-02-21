import { z } from "zod";

// Visibility enum for folder sharing
export const FolderVisibilitySchema = z.enum(["personal", "shared"]);
export type FolderVisibility = z.infer<typeof FolderVisibilitySchema>;

// Request schemas
export const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable().optional(),
  visibility: FolderVisibilitySchema.optional().default("personal"),
});

export const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().uuid().nullable().optional(),
  visibility: FolderVisibilitySchema.optional(),
});

// Response schema (what API returns)
export const FolderResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parentId: z.string().uuid().nullable(),
  visibility: FolderVisibilitySchema,
  userId: z.string().uuid(),
  creatorName: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Types derived from schemas
// CreateFolderDto uses z.input so callers can omit visibility (default applied server-side)
export type CreateFolderDto = z.input<typeof CreateFolderSchema>;
export type UpdateFolderDto = z.infer<typeof UpdateFolderSchema>;
export type FolderResponse = z.infer<typeof FolderResponseSchema>;
