import { ErrorCode } from "@qpp/shared-types";
import { and, count, eq } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { DatabaseError } from "../errors";
import {
  Credential,
  ICredentialsRepository,
  IFeatureOverrideRepository,
  ITenantRepository,
  IUserRepository,
  NewCredential,
  NewTenant,
  NewUser,
  Tenant,
  TenantFeatureOverride,
  User,
} from "../interfaces";
import { credentials, tenantFeatureOverrides, tenants, users } from "../schema";

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
