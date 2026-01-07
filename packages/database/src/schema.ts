import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  integer,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

// 1. Tenants (The High Level "Customer" / MCE Account)
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  eid: varchar("eid").notNull().unique(), // Enterprise ID
  tssd: varchar("tssd").notNull(), // Tenant Specific Subdomain
  installedAt: timestamp("installed_at").defaultNow(),
});

// 2. Users (The actual seat)
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  sfUserId: varchar("sf_user_id").notNull().unique(), // From MCE ID Token
  tenantId: uuid("tenant_id").references(() => tenants.id),
  email: varchar("email"),
  name: varchar("name"),
});

// 3. Credentials (The "Token Wallet" Layer)
export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    userId: uuid("user_id").references(() => users.id),
    mid: varchar("mid").notNull(), // Business Unit context
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(), // Encrypted!
    expiresAt: timestamp("expires_at").notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    unq: unique().on(t.userId, t.tenantId, t.mid),
  }),
);

// 4. Query History (The "Smart" Layer)
export const queryHistory = pgTable("query_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  mid: varchar("mid"), // Specific Business Unit context
  queryName: varchar("query_name").default("Untitled Query"),
  sqlText: text("sql_text").notNull(),
  targetDe: varchar("target_de"),
  executionTimeMs: integer("execution_time_ms"),
  status: varchar("status")
    .$type<"PENDING" | "SUCCESS" | "FAILED">()
    .default("PENDING"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 5. Saved Snippets
export const snippets = pgTable("snippets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  title: varchar("title").notNull(),
  code: text("code").notNull(),
  isShared: boolean("is_shared").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- Zod Validation Schemas ---
export const selectTenantSchema = createSelectSchema(tenants);
export const insertTenantSchema = createInsertSchema(tenants);

export const selectUserSchema = createSelectSchema(users);
export const insertUserSchema = createInsertSchema(users);

export const selectCredentialsSchema = createSelectSchema(credentials);
export const insertCredentialsSchema = createInsertSchema(credentials);

export const selectQueryHistorySchema = createSelectSchema(queryHistory);
export const insertQueryHistorySchema = createInsertSchema(queryHistory);

export const selectSnippetSchema = createSelectSchema(snippets);
export const insertSnippetSchema = createInsertSchema(snippets);
