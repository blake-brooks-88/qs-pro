CREATE TABLE "backoffice_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backoffice_user_id" varchar NOT NULL,
	"target_tenant_id" uuid,
	"event_type" varchar(100) NOT NULL,
	"metadata" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bo_accounts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"account_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bo_sessions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" varchar,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bo_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "bo_two_factors" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bo_users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" varchar DEFAULT 'viewer',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bo_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "bo_verifications" (
	"id" varchar PRIMARY KEY NOT NULL,
	"identifier" varchar NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD COLUMN "stripe_state_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "backoffice_audit_logs" ADD CONSTRAINT "backoffice_audit_logs_backoffice_user_id_bo_users_id_fk" FOREIGN KEY ("backoffice_user_id") REFERENCES "public"."bo_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backoffice_audit_logs" ADD CONSTRAINT "backoffice_audit_logs_target_tenant_id_tenants_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bo_accounts" ADD CONSTRAINT "bo_accounts_user_id_bo_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."bo_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bo_sessions" ADD CONSTRAINT "bo_sessions_user_id_bo_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."bo_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bo_two_factors" ADD CONSTRAINT "bo_two_factors_user_id_bo_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."bo_users"("id") ON DELETE cascade ON UPDATE no action;