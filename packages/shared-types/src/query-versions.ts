import { z } from "zod";

export const VersionListItemSchema = z.object({
  id: z.string().uuid(),
  savedQueryId: z.string().uuid(),
  lineCount: z.number().int(),
  source: z.enum(["save", "restore"]),
  restoredFromId: z.string().uuid().nullable(),
  versionName: z.string().max(255).nullable(),
  createdAt: z.string().datetime(),
  authorName: z.string().nullable(),
});
export type VersionListItem = z.infer<typeof VersionListItemSchema>;

export const VersionDetailSchema = z.object({
  id: z.string().uuid(),
  savedQueryId: z.string().uuid(),
  sqlText: z.string(),
  lineCount: z.number().int(),
  source: z.enum(["save", "restore"]),
  restoredFromId: z.string().uuid().nullable(),
  versionName: z.string().max(255).nullable(),
  createdAt: z.string().datetime(),
});
export type VersionDetail = z.infer<typeof VersionDetailSchema>;

export const VersionListResponseSchema = z.object({
  versions: z.array(VersionListItemSchema),
  total: z.number().int(),
});
export type VersionListResponse = z.infer<typeof VersionListResponseSchema>;

export const UpdateVersionNameSchema = z.object({
  versionName: z.string().max(255).nullable(),
});
export type UpdateVersionNameDto = z.infer<typeof UpdateVersionNameSchema>;
