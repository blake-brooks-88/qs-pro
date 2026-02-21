import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
  auditRetentionDays: integer("audit_retention_days").default(365),
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
    targetDeCustomerKey: varchar("target_de_customer_key"),
    targetUpdateType: varchar("target_update_type"),
    pollStartedAt: timestamp("poll_started_at"),
    errorMessage: text("error_message"),
    sqlTextEncrypted: text("sql_text_encrypted"),
    rowCount: integer("row_count"),
    savedQueryId: uuid("saved_query_id").references(() => savedQueries.id, {
      onDelete: "set null",
    }),
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

// 8. Folders (User-created folders for organizing saved queries)
export const folders = pgTable(
  "folders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    mid: varchar("mid").notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => folders.id),
    name: varchar("name").notNull(),
    visibility: varchar("visibility")
      .$type<"personal" | "shared">()
      .default("personal")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    tenantIdIdx: index("folders_tenant_id_idx").on(t.tenantId),
    userIdIdx: index("folders_user_id_idx").on(t.userId),
    parentIdIdx: index("folders_parent_id_idx").on(t.parentId),
    visibilityIdx: index("folders_visibility_idx").on(t.visibility),
  }),
);

// 9. Saved Queries (User-saved queries with folder organization)
export const savedQueries = pgTable(
  "saved_queries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    mid: varchar("mid").notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    folderId: uuid("folder_id").references(() => folders.id),
    name: varchar("name").notNull(),
    sqlTextEncrypted: text("sql_text_encrypted").notNull(),
    linkedQaObjectId: varchar("linked_qa_object_id"),
    linkedQaCustomerKey: varchar("linked_qa_customer_key"),
    linkedQaName: varchar("linked_qa_name"),
    linkedAt: timestamp("linked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
  },
  (t) => ({
    tenantIdIdx: index("saved_queries_tenant_id_idx").on(t.tenantId),
    userIdIdx: index("saved_queries_user_id_idx").on(t.userId),
    folderIdIdx: index("saved_queries_folder_id_idx").on(t.folderId),
    linkedQaUnique: uniqueIndex("saved_queries_linked_qa_unique")
      .on(t.tenantId, t.mid, t.linkedQaCustomerKey)
      .where(sql`${t.linkedQaCustomerKey} IS NOT NULL`),
  }),
);

// 10. Query Versions (Append-only version history for saved queries)
export const queryVersions = pgTable(
  "query_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    savedQueryId: uuid("saved_query_id")
      .references(() => savedQueries.id, { onDelete: "cascade" })
      .notNull(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    mid: varchar("mid").notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    sqlTextEncrypted: text("sql_text_encrypted").notNull(),
    sqlTextHash: varchar("sql_text_hash").notNull(),
    versionName: varchar("version_name", { length: 255 }),
    lineCount: integer("line_count").notNull(),
    source: varchar("source")
      .$type<"save" | "restore">()
      .default("save")
      .notNull(),
    restoredFromId: uuid("restored_from_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    savedQueryIdIdx: index("query_versions_saved_query_id_idx").on(
      t.savedQueryId,
    ),
    tenantIdIdx: index("query_versions_tenant_id_idx").on(t.tenantId),
    createdAtIdx: index("query_versions_created_at_idx").on(t.createdAt),
  }),
);

// 11. Query Publish Events (Annotation model: tags an existing version as published)
export const queryPublishEvents = pgTable(
  "query_publish_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    savedQueryId: uuid("saved_query_id")
      .references(() => savedQueries.id, { onDelete: "cascade" })
      .notNull(),
    versionId: uuid("version_id")
      .references(() => queryVersions.id, { onDelete: "cascade" })
      .notNull(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    mid: varchar("mid").notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    linkedQaCustomerKey: varchar("linked_qa_customer_key").notNull(),
    publishedSqlHash: varchar("published_sql_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    savedQueryIdIdx: index("query_publish_events_saved_query_id_idx").on(
      t.savedQueryId,
    ),
    versionIdIdx: index("query_publish_events_version_id_idx").on(t.versionId),
    tenantIdIdx: index("query_publish_events_tenant_id_idx").on(t.tenantId),
  }),
);

// 12. Audit Logs (Append-only audit trail)
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  mid: varchar("mid").notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  actorType: varchar("actor_type", { length: 20 })
    .$type<"user" | "system">()
    .notNull(),
  actorId: uuid("actor_id"),
  targetId: varchar("target_id", { length: 255 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Zod Validation Schemas ---
export const selectTenantSchema = createSelectSchema(tenants);
export const insertTenantSchema = createInsertSchema(tenants);

export const selectUserSchema = createSelectSchema(users);
export const insertUserSchema = createInsertSchema(users);

export const selectCredentialsSchema = createSelectSchema(credentials);
export const insertCredentialsSchema = createInsertSchema(credentials);

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

export const selectFolderSchema = createSelectSchema(folders);
export const insertFolderSchema = createInsertSchema(folders);

export const selectSavedQuerySchema = createSelectSchema(savedQueries);
export const insertSavedQuerySchema = createInsertSchema(savedQueries);

export const selectQueryVersionSchema = createSelectSchema(queryVersions);
export const insertQueryVersionSchema = createInsertSchema(queryVersions);

export const selectQueryPublishEventSchema =
  createSelectSchema(queryPublishEvents);
export const insertQueryPublishEventSchema =
  createInsertSchema(queryPublishEvents);

export const selectAuditLogSchema = createSelectSchema(auditLogs);
export const insertAuditLogSchema = createInsertSchema(auditLogs);
