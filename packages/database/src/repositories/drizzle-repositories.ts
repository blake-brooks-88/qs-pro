import { ErrorCode } from "@qpp/shared-types";
import { and, count, eq, isNull, or, sql } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { DatabaseError } from "../errors";
import {
  Credential,
  ICredentialsRepository,
  IFeatureOverrideRepository,
  IOrgSubscriptionRepository,
  IStripeBillingBindingRepository,
  IStripeCheckoutSessionRepository,
  IStripeWebhookEventRepository,
  ITenantRepository,
  IUserRepository,
  NewCredential,
  NewOrgSubscription,
  NewStripeBillingBinding,
  NewStripeCheckoutSession,
  NewTenant,
  NewUser,
  OrgSubscription,
  StripeBillingBinding,
  StripeCheckoutSession,
  Tenant,
  TenantFeatureOverride,
  User,
} from "../interfaces";
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

export class DrizzleTenantRepository implements ITenantRepository {
  constructor(private db: PostgresJsDatabase) {}

  async findById(id: string): Promise<Tenant | undefined> {
    const [result] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id));
    return result;
  }

  async findByEid(eid: string): Promise<Tenant | undefined> {
    const [result] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.eid, eid));
    return result;
  }

  async upsert(tenant: NewTenant): Promise<Tenant> {
    const [result] = await this.db
      .insert(tenants)
      .values(tenant)
      .onConflictDoUpdate({
        target: tenants.eid,
        set: { tssd: tenant.tssd },
      })
      .returning();
    if (!result) {
      throw new DatabaseError(
        ErrorCode.DATABASE_ERROR,
        "Tenant upsert failed to return a result",
        { operation: "upsertTenant" },
      );
    }
    return result;
  }

  async countUsersByTenantId(tenantId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(users)
      .where(eq(users.tenantId, tenantId));
    return result?.count ?? 0;
  }
}

export class DrizzleUserRepository implements IUserRepository {
  constructor(private db: PostgresJsDatabase) {}

  async findById(id: string): Promise<User | undefined> {
    const [result] = await this.db.select().from(users).where(eq(users.id, id));
    return result;
  }

  async findBySfUserId(sfUserId: string): Promise<User | undefined> {
    const [result] = await this.db
      .select()
      .from(users)
      .where(eq(users.sfUserId, sfUserId));
    return result;
  }

  async upsert(user: NewUser): Promise<User> {
    const [result] = await this.db
      .insert(users)
      .values(user)
      .onConflictDoUpdate({
        target: users.sfUserId,
        set: {
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
        },
      })
      .returning();
    if (!result) {
      throw new DatabaseError(
        ErrorCode.DATABASE_ERROR,
        "User upsert failed to return a result",
        { operation: "upsertUser" },
      );
    }
    return result;
  }
}

export class DrizzleCredentialsRepository implements ICredentialsRepository {
  constructor(private db: PostgresJsDatabase) {}

  async findByUserTenantMid(
    userId: string,
    tenantId: string,
    mid: string,
  ): Promise<Credential | undefined> {
    const [result] = await this.db
      .select()
      .from(credentials)
      .where(
        and(
          eq(credentials.userId, userId),
          eq(credentials.tenantId, tenantId),
          eq(credentials.mid, mid),
        ),
      );
    return result;
  }

  async upsert(credential: NewCredential): Promise<Credential> {
    // Check if it already exists to determine if we should update or insert
    // Drizzle onConflict for multiple columns can be tricky depending on constraints
    // For now, we'll use a simple approach or assuming a unique constraint exists on (user_id, tenant_id)
    const [result] = await this.db
      .insert(credentials)
      .values(credential)
      .onConflictDoUpdate({
        target: [credentials.userId, credentials.tenantId, credentials.mid],
        set: {
          accessToken: credential.accessToken,
          refreshToken: credential.refreshToken,
          mid: credential.mid,
          expiresAt: credential.expiresAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!result) {
      throw new DatabaseError(
        ErrorCode.DATABASE_ERROR,
        "Credential upsert failed to return a result",
        { operation: "upsertCredential" },
      );
    }
    return result;
  }
}

export class DrizzleFeatureOverrideRepository implements IFeatureOverrideRepository {
  constructor(private db: PostgresJsDatabase) {}

  async findByTenantId(tenantId: string): Promise<TenantFeatureOverride[]> {
    return this.db
      .select()
      .from(tenantFeatureOverrides)
      .where(eq(tenantFeatureOverrides.tenantId, tenantId));
  }
}

export class DrizzleOrgSubscriptionRepository implements IOrgSubscriptionRepository {
  constructor(private db: PostgresJsDatabase) {}

  async findByTenantId(tenantId: string): Promise<OrgSubscription | undefined> {
    const [result] = await this.db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.tenantId, tenantId));
    return result;
  }

  async upsert(subscription: NewOrgSubscription): Promise<OrgSubscription> {
    const [result] = await this.db
      .insert(orgSubscriptions)
      .values(subscription)
      .onConflictDoUpdate({
        target: orgSubscriptions.tenantId,
        set: {
          tier: subscription.tier,
          seatLimit: subscription.seatLimit,
          stripeCustomerId: subscription.stripeCustomerId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          stripeSubscriptionStatus: subscription.stripeSubscriptionStatus,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnds: subscription.currentPeriodEnds,
          lastInvoicePaidAt: subscription.lastInvoicePaidAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!result) {
      throw new DatabaseError(
        ErrorCode.DATABASE_ERROR,
        "OrgSubscription upsert failed to return a result",
        { operation: "upsertOrgSubscription" },
      );
    }
    return result;
  }

  async insertIfNotExists(subscription: NewOrgSubscription): Promise<boolean> {
    const result = await this.db
      .insert(orgSubscriptions)
      .values(subscription)
      .onConflictDoNothing({ target: orgSubscriptions.tenantId })
      .returning({ id: orgSubscriptions.id });
    return result.length > 0;
  }

  async startTrialIfEligible(
    tenantId: string,
    trialEndsAt: Date,
  ): Promise<boolean> {
    const result = await this.db
      .update(orgSubscriptions)
      .set({
        tier: "pro",
        trialEndsAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orgSubscriptions.tenantId, tenantId),
          eq(orgSubscriptions.tier, "free"),
          isNull(orgSubscriptions.trialEndsAt),
          isNull(orgSubscriptions.stripeSubscriptionId),
        ),
      )
      .returning({ id: orgSubscriptions.id });
    return result.length > 0;
  }

  async updateTierByTenantId(
    tenantId: string,
    tier: "free" | "pro" | "enterprise",
  ): Promise<void> {
    await this.db
      .update(orgSubscriptions)
      .set({ tier, updatedAt: new Date() })
      .where(eq(orgSubscriptions.tenantId, tenantId));
  }

  async updateFromWebhook(
    tenantId: string,
    data: Partial<OrgSubscription>,
  ): Promise<void> {
    const {
      id: _id,
      tenantId: _tenantId,
      createdAt: _createdAt,
      ...updateData
    } = data;
    await this.db
      .update(orgSubscriptions)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(orgSubscriptions.tenantId, tenantId));
  }
}

export class DrizzleStripeBillingBindingRepository
  implements IStripeBillingBindingRepository
{
  constructor(private db: PostgresJsDatabase) {}

  async findByTenantId(
    tenantId: string,
  ): Promise<StripeBillingBinding | undefined> {
    const [result] = await this.db
      .select()
      .from(stripeBillingBindings)
      .where(eq(stripeBillingBindings.tenantId, tenantId));
    return result;
  }

  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<StripeBillingBinding | undefined> {
    const [result] = await this.db
      .select()
      .from(stripeBillingBindings)
      .where(eq(stripeBillingBindings.stripeCustomerId, stripeCustomerId));
    return result;
  }

  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<StripeBillingBinding | undefined> {
    const [result] = await this.db
      .select()
      .from(stripeBillingBindings)
      .where(eq(stripeBillingBindings.stripeSubscriptionId, stripeSubscriptionId));
    return result;
  }

  async upsert(binding: NewStripeBillingBinding): Promise<StripeBillingBinding> {
    const [result] = await this.db
      .insert(stripeBillingBindings)
      .values(binding)
      .onConflictDoUpdate({
        target: stripeBillingBindings.tenantId,
        set: {
          stripeCustomerId: binding.stripeCustomerId,
          stripeSubscriptionId: binding.stripeSubscriptionId,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!result) {
      throw new DatabaseError(
        ErrorCode.DATABASE_ERROR,
        "Stripe billing binding upsert failed to return a result",
        { operation: "upsertStripeBillingBinding" },
      );
    }
    return result;
  }

  async clearSubscription(tenantId: string): Promise<void> {
    await this.db
      .update(stripeBillingBindings)
      .set({
        stripeSubscriptionId: null,
        updatedAt: new Date(),
      })
      .where(eq(stripeBillingBindings.tenantId, tenantId));
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    await this.db
      .delete(stripeBillingBindings)
      .where(eq(stripeBillingBindings.tenantId, tenantId));
  }
}

export class DrizzleStripeCheckoutSessionRepository
  implements IStripeCheckoutSessionRepository
{
  constructor(private db: PostgresJsDatabase) {}

  async findByTenantId(
    tenantId: string,
  ): Promise<StripeCheckoutSession | undefined> {
    const [result] = await this.db
      .select()
      .from(stripeCheckoutSessions)
      .where(eq(stripeCheckoutSessions.tenantId, tenantId));
    return result;
  }

  async upsert(
    session: NewStripeCheckoutSession,
  ): Promise<StripeCheckoutSession> {
    const [result] = await this.db
      .insert(stripeCheckoutSessions)
      .values(session)
      .onConflictDoUpdate({
        target: stripeCheckoutSessions.tenantId,
        set: {
          idempotencyKey: session.idempotencyKey,
          sessionId: session.sessionId,
          sessionUrl: session.sessionUrl,
          tier: session.tier,
          interval: session.interval,
          status: session.status,
          expiresAt: session.expiresAt,
          lastError: session.lastError,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!result) {
      throw new DatabaseError(
        ErrorCode.DATABASE_ERROR,
        "Stripe checkout session upsert failed to return a result",
        { operation: "upsertStripeCheckoutSession" },
      );
    }
    return result;
  }

  async markCompleted(sessionId: string): Promise<void> {
    await this.db
      .update(stripeCheckoutSessions)
      .set({
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(stripeCheckoutSessions.sessionId, sessionId));
  }

  async markExpired(sessionId: string): Promise<void> {
    await this.db
      .update(stripeCheckoutSessions)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(eq(stripeCheckoutSessions.sessionId, sessionId));
  }

  async markFailed(tenantId: string, errorMessage: string): Promise<void> {
    await this.db
      .update(stripeCheckoutSessions)
      .set({
        status: "failed",
        lastError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(stripeCheckoutSessions.tenantId, tenantId));
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    await this.db
      .delete(stripeCheckoutSessions)
      .where(eq(stripeCheckoutSessions.tenantId, tenantId));
  }
}

export class DrizzleStripeWebhookEventRepository implements IStripeWebhookEventRepository {
  constructor(private db: PostgresJsDatabase) {}

  async markProcessing(eventId: string, eventType: string): Promise<boolean> {
    const result = await this.db
      .insert(stripeWebhookEvents)
      .values({
        id: eventId,
        eventType,
        status: "processing",
      })
      .onConflictDoUpdate({
        target: stripeWebhookEvents.id,
        set: {
          status: "processing" as const,
          processedAt: sql`NOW()`,
          errorMessage: null,
        },
        setWhere: or(
          eq(stripeWebhookEvents.status, "failed"),
          and(
            eq(stripeWebhookEvents.status, "processing"),
            sql`${stripeWebhookEvents.processedAt} < NOW() - INTERVAL '5 minutes'`,
          ),
        ),
      })
      .returning({ id: stripeWebhookEvents.id });
    return result.length > 0;
  }

  async markCompleted(eventId: string): Promise<void> {
    await this.db
      .update(stripeWebhookEvents)
      .set({
        status: "completed",
        completedAt: sql`NOW()`,
      })
      .where(eq(stripeWebhookEvents.id, eventId));
  }

  async markFailed(eventId: string, errorMessage: string): Promise<void> {
    await this.db
      .update(stripeWebhookEvents)
      .set({
        status: "failed",
        errorMessage,
      })
      .where(eq(stripeWebhookEvents.id, eventId));
  }
}
