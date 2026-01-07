import { tenants, users, credentials } from "../schema";

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | undefined>;
  findByEid(eid: string): Promise<Tenant | undefined>;
  upsert(tenant: NewTenant): Promise<Tenant>;
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
