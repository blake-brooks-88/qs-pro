import { z } from "zod";

export const TenantListQuerySchema = z.object({
  search: z.string().optional(),
  tier: z.enum(["free", "pro", "enterprise"]).optional(),
  status: z
    .enum([
      "inactive",
      "trialing",
      "active",
      "past_due",
      "unpaid",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "paused",
    ])
    .optional(),
  sortBy: z
    .enum([
      "eid",
      "companyName",
      "tier",
      "subscriptionStatus",
      "userCount",
      "signupDate",
      "lastActiveDate",
    ])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type TenantListQuery = z.input<typeof TenantListQuerySchema>;

export const ChangeTierSchema = z.object({
  tier: z.enum(["free", "pro", "enterprise"]),
  interval: z.enum(["month", "year", "monthly", "annual"]),
});

export type ChangeTierDto = z.infer<typeof ChangeTierSchema>;

export interface TenantListItemDto {
  tenantId: string;
  eid: string;
  companyName: string;
  tier: string;
  subscriptionStatus: string;
  userCount: number;
  signupDate: Date | null;
  lastActiveDate: Date | null;
}

export interface EidLookupResultDto {
  eid: string;
  companyName: string;
  userCount: number;
  tier: string;
  subscriptionStatus: string;
  signupDate: Date | null;
}

export interface TenantDetailDto {
  tenantId: string;
  eid: string;
  companyName: string;
  tier: string;
  subscriptionStatus: string;
  seatLimit: number | null;
  currentPeriodEnds: Date | null;
  trialEndsAt: Date | null;
  stripeSubscriptionId: string | null;
  signupDate: Date | null;
  users: TenantUserDto[];
  featureOverrides: FeatureOverrideDto[];
  recentAuditLogs: AuditLogEntryDto[];
}

export interface TenantUserDto {
  name: string | null;
  email: string | null;
  lastActiveDate: Date | null;
}

export interface FeatureOverrideDto {
  featureKey: string;
  enabled: boolean;
}

export interface AuditLogEntryDto {
  id: string;
  backofficeUserId: string;
  eventType: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface PaginatedResult<T> {
  data: T[];
  page: number;
  limit: number;
  total?: number;
}
