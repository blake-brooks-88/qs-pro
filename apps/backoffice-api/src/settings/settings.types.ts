import { z } from "zod";

export const InviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
  name: z.string().optional(),
});

export type InviteUserDto = z.infer<typeof InviteUserSchema>;

export const ChangeRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});

export type ChangeRoleDto = z.infer<typeof ChangeRoleSchema>;

export const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;

export const ListUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
