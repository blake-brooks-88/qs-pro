import { Inject, Injectable } from "@nestjs/common";
import type { PostgresJsDatabase } from "@qpp/database";
import {
  and,
  asc,
  backofficeAuditLogs,
  count,
  desc,
  eq,
  ilike,
  or,
  orgSubscriptions,
  sql,
  tenantFeatureOverrides,
  tenants,
  users,
} from "@qpp/database";

import { DRIZZLE_DB } from "../database/database.module.js";
import type {
  EidLookupResultDto,
  PaginatedResult,
  TenantDetailDto,
  TenantListItemDto,
  TenantListQuery,
  TenantUserDto,
} from "./tenants.types.js";

@Injectable()
export class TenantsService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: PostgresJsDatabase) {}

  async findAll(
    query: TenantListQuery,
  ): Promise<PaginatedResult<TenantListItemDto>> {
    const { page = 1, limit = 25, search, tier, status } = query;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(tenants.eid, `%${search}%`),
          ilike(tenants.tssd, `%${search}%`),
        ),
      );
    }

    if (tier) {
      conditions.push(eq(orgSubscriptions.tier, tier));
    }

    if (status) {
      conditions.push(eq(orgSubscriptions.stripeSubscriptionStatus, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const userCounts = this.db
      .select({
        tenantId: users.tenantId,
        userCount: count(users.id).as("user_count"),
      })
      .from(users)
      .groupBy(users.tenantId)
      .as("user_counts");

    const sortColumn = this.getSortColumn(query.sortBy);
    const sortDirection = query.sortOrder === "desc" ? desc : asc;

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          tenantId: tenants.id,
          eid: tenants.eid,
          companyName: tenants.tssd,
          tier: orgSubscriptions.tier,
          subscriptionStatus: orgSubscriptions.stripeSubscriptionStatus,
          userCount: sql<number>`COALESCE(${userCounts.userCount}, 0)`,
          signupDate: tenants.installedAt,
          lastActiveDate: sql<Date | null>`NULL`,
        })
        .from(tenants)
        .leftJoin(orgSubscriptions, eq(tenants.id, orgSubscriptions.tenantId))
        .leftJoin(userCounts, eq(tenants.id, userCounts.tenantId))
        .where(whereClause)
        .orderBy(sortDirection(sortColumn))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: sql<number>`COUNT(DISTINCT ${tenants.id})` })
        .from(tenants)
        .leftJoin(orgSubscriptions, eq(tenants.id, orgSubscriptions.tenantId))
        .where(whereClause),
    ]);

    const total = Number(totalRows[0]?.total ?? 0);

    return {
      data: rows.map((r) => ({
        tenantId: r.tenantId,
        eid: r.eid,
        companyName: r.companyName,
        tier: r.tier ?? "free",
        subscriptionStatus: r.subscriptionStatus ?? "inactive",
        userCount: Number(r.userCount),
        signupDate: r.signupDate,
        lastActiveDate: r.lastActiveDate,
      })),
      page,
      limit,
      total,
    };
  }

  async findById(tenantId: string): Promise<TenantDetailDto | null> {
    const rows = await this.db
      .select({
        tenantId: tenants.id,
        eid: tenants.eid,
        companyName: tenants.tssd,
        tier: orgSubscriptions.tier,
        subscriptionStatus: orgSubscriptions.stripeSubscriptionStatus,
        seatLimit: orgSubscriptions.seatLimit,
        currentPeriodEnds: orgSubscriptions.currentPeriodEnds,
        trialEndsAt: orgSubscriptions.trialEndsAt,
        stripeSubscriptionId: orgSubscriptions.stripeSubscriptionId,
        signupDate: tenants.installedAt,
      })
      .from(tenants)
      .leftJoin(orgSubscriptions, eq(tenants.id, orgSubscriptions.tenantId))
      .where(eq(tenants.id, tenantId))
      .limit(1)
      .offset(0);

    const row = rows[0];
    if (!row) {
      return null;
    }

    const [tenantUsers, featureOverrides, recentLogs] = await Promise.all([
      this.getUsersForTenant(tenantId),
      this.getFeatureOverrides(tenantId),
      this.getRecentAuditLogs(tenantId),
    ]);

    return {
      tenantId: row.tenantId,
      eid: row.eid,
      companyName: row.companyName,
      tier: row.tier ?? "free",
      subscriptionStatus: row.subscriptionStatus ?? "inactive",
      seatLimit: row.seatLimit,
      currentPeriodEnds: row.currentPeriodEnds,
      trialEndsAt: row.trialEndsAt,
      stripeSubscriptionId: row.stripeSubscriptionId,
      signupDate: row.signupDate,
      users: tenantUsers,
      featureOverrides,
      recentAuditLogs: recentLogs,
    };
  }

  async lookupByEid(eid: string): Promise<EidLookupResultDto | null> {
    const userCounts = this.db
      .select({
        tenantId: users.tenantId,
        userCount: count(users.id).as("user_count"),
      })
      .from(users)
      .groupBy(users.tenantId)
      .as("user_counts");

    const rows = await this.db
      .select({
        eid: tenants.eid,
        companyName: tenants.tssd,
        userCount: sql<number>`COALESCE(${userCounts.userCount}, 0)`,
        tier: orgSubscriptions.tier,
        subscriptionStatus: orgSubscriptions.stripeSubscriptionStatus,
        signupDate: tenants.installedAt,
      })
      .from(tenants)
      .leftJoin(orgSubscriptions, eq(tenants.id, orgSubscriptions.tenantId))
      .leftJoin(userCounts, eq(tenants.id, userCounts.tenantId))
      .where(eq(tenants.eid, eid))
      .limit(1)
      .offset(0);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      eid: row.eid,
      companyName: row.companyName,
      userCount: Number(row.userCount),
      tier: row.tier ?? "free",
      subscriptionStatus: row.subscriptionStatus ?? "inactive",
      signupDate: row.signupDate,
    };
  }

  async getUsersForTenant(tenantId: string): Promise<TenantUserDto[]> {
    const rows = await this.db
      .select({
        name: users.name,
        email: users.email,
        lastActiveDate: sql<Date | null>`NULL`,
      })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .limit(1000)
      .offset(0);

    return rows.map((r) => ({
      name: r.name,
      email: r.email,
      lastActiveDate: r.lastActiveDate,
    }));
  }

  private async getFeatureOverrides(tenantId: string) {
    return this.db
      .select({
        featureKey: tenantFeatureOverrides.featureKey,
        enabled: tenantFeatureOverrides.enabled,
      })
      .from(tenantFeatureOverrides)
      .where(eq(tenantFeatureOverrides.tenantId, tenantId));
  }

  private async getRecentAuditLogs(tenantId: string) {
    return this.db
      .select({
        id: backofficeAuditLogs.id,
        backofficeUserId: backofficeAuditLogs.backofficeUserId,
        eventType: backofficeAuditLogs.eventType,
        metadata: backofficeAuditLogs.metadata,
        createdAt: backofficeAuditLogs.createdAt,
      })
      .from(backofficeAuditLogs)
      .where(eq(backofficeAuditLogs.targetTenantId, tenantId))
      .orderBy(desc(backofficeAuditLogs.createdAt))
      .limit(20);
  }

  private getSortColumn(sortBy?: string) {
    switch (sortBy) {
      case "eid":
        return tenants.eid;
      case "companyName":
        return tenants.tssd;
      case "tier":
        return orgSubscriptions.tier;
      case "subscriptionStatus":
        return orgSubscriptions.stripeSubscriptionStatus;
      case "signupDate":
        return tenants.installedAt;
      default:
        return tenants.installedAt;
    }
  }
}
