import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// 1. Tenants (The High Level "Customer" / MCE Account)
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  eid: varchar("eid").notNull().unique(), // Enterprise ID
  tssd: varchar("tssd").notNull(), // Tenant Specific Subdomain
  subscriptionTier: varchar("subscription_tier")
    .$type<"free" | "pro" | "enterprise">()
    .default("free")
    .notNull(),
  seatLimit: integer("seat_limit"), // null = unlimited
  installedAt: timestamp("installed_at").defaultNow(),
});

export const tenantFeatureOverrides = pgTable(
  "tenant_feature_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    featureKey: varchar("feature_key").notNull(),
    enabled: boolean("enabled").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    unq: unique().on(t.tenantId, t.featureKey),
    tenantIdIdx: index("tenant_feature_overrides_tenant_id_idx").on(t.tenantId),
  }),
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  sfUserId: varchar("sf_user_id").notNull().unique(),
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

// 6. Shell Query Runs
export type ShellQueryRunStatus =
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "canceled";

export const shellQueryRuns = pgTable(
  "shell_query_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    mid: varchar("mid").notNull(),
    snippetName: varchar("snippet_name"),
    sqlTextHash: varchar("sql_text_hash").notNull(),
    status: varchar("status")
      .$type<ShellQueryRunStatus>()
      .default("queued")
      .notNull(),
    taskId: varchar("task_id"),
    queryDefinitionId: varchar("query_definition_id"),
    pollStartedAt: timestamp("poll_started_at"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    tenantIdIdx: index("shell_query_runs_tenant_id_idx").on(t.tenantId),
    statusIdx: index("shell_query_runs_status_idx").on(t.status),
    createdAtIdx: index("shell_query_runs_created_at_idx").on(t.createdAt),
  }),
);

// 7. Tenant Settings (e.g. Cached Folder IDs)
export const tenantSettings = pgTable(
  "tenant_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    mid: varchar("mid").notNull(),
    qppFolderId: integer("qpp_folder_id"),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    unq: unique().on(t.tenantId, t.mid),
  }),
);

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

export const selectShellQueryRunSchema = createSelectSchema(shellQueryRuns);
export const insertShellQueryRunSchema = createInsertSchema(shellQueryRuns);

export const selectTenantSettingsSchema = createSelectSchema(tenantSettings);
export const insertTenantSettingsSchema = createInsertSchema(tenantSettings);

export const selectTenantFeatureOverrideSchema = createSelectSchema(
  tenantFeatureOverrides,
);
export const insertTenantFeatureOverrideSchema = createInsertSchema(
  tenantFeatureOverrides,
);
