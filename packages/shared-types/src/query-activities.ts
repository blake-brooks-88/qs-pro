import { z } from "zod";

/**
 * Validation constraints for Query Activity creation.
 * - name: 1-200 characters, required
 * - customerKey: max 36 characters, alphanumeric with underscores/hyphens, optional (auto-generated if blank)
 * - description: max 500 characters, optional
 * - categoryId: folder ID, undefined means root folder (MCE has no folder ID 0)
 * - targetDataExtensionCustomerKey: required, identifies the target DE
 * - queryText: 1-100,000 characters, the SQL query
 * - targetUpdateType: "Overwrite" (default), "Append", or "Update"
 */
export const CreateQueryActivitySchema = z.object({
  /** Display name for the Query Activity (1-200 characters) */
  name: z.string().min(1).max(200),
  /** External key identifier (max 36 characters, alphanumeric with underscores/hyphens) */
  customerKey: z
    .string()
    .max(36)
    .regex(
      /^[a-zA-Z0-9_-]*$/,
      "Must contain only alphanumeric characters, underscores, or hyphens",
    )
    .optional(),
  /** Optional description of the Query Activity (max 500 characters) */
  description: z.string().max(500).optional(),
  /** Folder ID where the Query Activity will be created (undefined = root folder) */
  categoryId: z.number().int().positive().optional(),
  /** Customer key of the target Data Extension */
  targetDataExtensionCustomerKey: z.string().min(1),
  /** Enterprise ID of the target Data Extension (optional, for shared DEs) */
  targetDataExtensionEid: z.string().optional(),
  /** SQL query text (1-100,000 characters) */
  queryText: z.string().min(1).max(100_000),
  /** How data is written to the target: Overwrite (replace all), Append (add new), Update (upsert by PK) */
  targetUpdateType: z
    .enum(["Overwrite", "Append", "Update"])
    .default("Overwrite"),
});

/** DTO for creating a new Query Activity in MCE */
export type CreateQueryActivityDto = z.infer<typeof CreateQueryActivitySchema>;
