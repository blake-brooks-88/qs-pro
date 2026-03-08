import {
  credentials,
  orgSubscriptions,
  stripeBillingBindings,
  stripeCheckoutSessions,
  stripeWebhookEvents,
  tenantFeatureOverrides,
  tenants,
  users,
} from "../schema";

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;

export type TenantFeatureOverride = typeof tenantFeatureOverrides.$inferSelect;
export type NewTenantFeatureOverride =
  typeof tenantFeatureOverrides.$inferInsert;

export type OrgSubscription = typeof orgSubscriptions.$inferSelect;
export type NewOrgSubscription = typeof orgSubscriptions.$inferInsert;

export type StripeBillingBinding = typeof stripeBillingBindings.$inferSelect;
export type NewStripeBillingBinding = typeof stripeBillingBindings.$inferInsert;

export type StripeCheckoutSession = typeof stripeCheckoutSessions.$inferSelect;
export type NewStripeCheckoutSession =
  typeof stripeCheckoutSessions.$inferInsert;

export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | undefined>;
  findByEid(eid: string): Promise<Tenant | undefined>;
  upsert(tenant: NewTenant): Promise<Tenant>;
  countUsersByTenantId(tenantId: string): Promise<number>;
}

export interface IUserRepository {
  findById(id: string): Promise<User | undefined>;
  findBySfUserId(sfUserId: string): Promise<User | undefined>;
  upsert(user: NewUser): Promise<User>;
}

export interface ICredentialsRepository {
  findByUserTenantMid(
    userId: string,
    tenantId: string,
    mid: string,
  ): Promise<Credential | undefined>;
  upsert(credential: NewCredential): Promise<Credential>;
}

export interface IFeatureOverrideRepository {
  findByTenantId(tenantId: string): Promise<TenantFeatureOverride[]>;
}

export interface IOrgSubscriptionRepository {
  findByTenantId(tenantId: string): Promise<OrgSubscription | undefined>;
  upsert(subscription: NewOrgSubscription): Promise<OrgSubscription>;
  insertIfNotExists(subscription: NewOrgSubscription): Promise<boolean>;
  startTrialIfEligible(tenantId: string, trialEndsAt: Date): Promise<boolean>;
  updateTierByTenantId(
    tenantId: string,
    tier: "free" | "pro" | "enterprise",
  ): Promise<void>;
  updateFromWebhook(
    tenantId: string,
    data: Partial<OrgSubscription>,
  ): Promise<void>;
}

export interface IStripeBillingBindingRepository {
  findByTenantId(tenantId: string): Promise<StripeBillingBinding | undefined>;
  findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<StripeBillingBinding | undefined>;
  findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<StripeBillingBinding | undefined>;
  upsert(binding: NewStripeBillingBinding): Promise<StripeBillingBinding>;
  clearSubscription(tenantId: string): Promise<void>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

export interface IStripeCheckoutSessionRepository {
  findByTenantId(tenantId: string): Promise<StripeCheckoutSession | undefined>;
  upsert(session: NewStripeCheckoutSession): Promise<StripeCheckoutSession>;
  markCompleted(sessionId: string): Promise<void>;
  markExpired(sessionId: string): Promise<void>;
  markFailed(tenantId: string, errorMessage: string): Promise<void>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

export interface IStripeWebhookEventRepository {
  markProcessing(eventId: string, eventType: string): Promise<boolean>;
  markCompleted(eventId: string): Promise<void>;
  markFailed(eventId: string, errorMessage: string): Promise<void>;
}
