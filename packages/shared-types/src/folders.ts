import { z } from "zod";

// Request schemas
export const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable().optional(),
});

export const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

// Response schema (what API returns)
export const FolderResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parentId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Types derived from schemas
export type CreateFolderDto = z.infer<typeof CreateFolderSchema>;
export type UpdateFolderDto = z.infer<typeof UpdateFolderSchema>;
export type FolderResponse = z.infer<typeof FolderResponseSchema>;
