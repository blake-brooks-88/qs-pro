import { ErrorCode } from "@qpp/shared-types";
import { and, count, eq, or, sql } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { DatabaseError } from "../errors";
import {
  Credential,
  ICredentialsRepository,
  IFeatureOverrideRepository,
  IOrgSubscriptionRepository,
  IStripeWebhookEventRepository,
  ITenantRepository,
  IUserRepository,
  NewCredential,
  NewOrgSubscription,
  NewTenant,
  NewUser,
  OrgSubscription,
  Tenant,
  TenantFeatureOverride,
  User,
} from "../interfaces";
import {
  credentials,
  orgSubscriptions,
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

  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<OrgSubscription | undefined> {
    const [result] = await this.db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.stripeCustomerId, stripeCustomerId));
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
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnds: subscription.currentPeriodEnds,
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
