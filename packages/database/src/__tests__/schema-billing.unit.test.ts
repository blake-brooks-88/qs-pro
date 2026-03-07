import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  credentials,
  folders,
  orgSubscriptions,
  queryVersions,
  shellQueryRuns,
  stripeBillingBindings,
  stripeCheckoutSessions,
  tenantFeatureOverrides,
  tenantSettings,
  users,
} from '../schema';

describe('billing-related schema definitions', () => {
  it('defines tenant feature overrides with the expected unique constraint and index', () => {
    const config = getTableConfig(tenantFeatureOverrides);

    expect(config.uniqueConstraints.map((item) => item.name)).toContain(
      'tenant_feature_overrides_tenant_id_feature_key_unique',
    );
    expect(config.indexes.map((item) => item.config.name)).toContain(
      'tenant_feature_overrides_tenant_id_idx',
    );
  });

  it('defines the users table with tenant and profile columns', () => {
    const config = getTableConfig(users);
    const columnNames = config.columns.map((column) => column.name);

    expect(columnNames).toEqual(
      expect.arrayContaining(['tenant_id', 'email', 'name']),
    );
  });

  it('defines org subscriptions with paid-state columns and a tenant index', () => {
    const config = getTableConfig(orgSubscriptions);
    const columnNames = config.columns.map((column) => column.name);

    expect(columnNames).toEqual(
      expect.arrayContaining([
        'stripe_subscription_status',
        'last_invoice_paid_at',
      ]),
    );
    expect(config.indexes.map((item) => item.config.name)).toContain(
      'org_subscriptions_tenant_id_idx',
    );
  });

  it('defines Stripe billing binding indexes for customer and subscription ids', () => {
    const config = getTableConfig(stripeBillingBindings);

    expect(config.indexes.map((item) => item.config.name)).toEqual(
      expect.arrayContaining([
        'stripe_billing_bindings_customer_id_idx',
        'stripe_billing_bindings_subscription_id_idx',
      ]),
    );
  });

  it('defines Stripe checkout sessions with idempotency and session indexes', () => {
    const config = getTableConfig(stripeCheckoutSessions);
    const columnNames = config.columns.map((column) => column.name);

    expect(columnNames).toEqual(
      expect.arrayContaining([
        'idempotency_key',
        'session_id',
        'session_url',
        'last_error',
      ]),
    );
    expect(config.indexes.map((item) => item.config.name)).toEqual(
      expect.arrayContaining([
        'stripe_checkout_sessions_tenant_id_idx',
        'stripe_checkout_sessions_idempotency_key_idx',
        'stripe_checkout_sessions_session_id_idx',
      ]),
    );
  });

  it('defines credentials, shell query runs, tenant settings, folders, and query versions indexes used by the app', () => {
    expect(
      getTableConfig(credentials).uniqueConstraints.map((item) => item.name),
    ).toContain('credentials_user_id_tenant_id_mid_unique');
    expect(
      getTableConfig(shellQueryRuns).indexes.map((item) => item.config.name),
    ).toEqual(
      expect.arrayContaining([
        'shell_query_runs_tenant_id_idx',
        'shell_query_runs_status_idx',
        'shell_query_runs_created_at_idx',
      ]),
    );
    expect(
      getTableConfig(tenantSettings).uniqueConstraints.map((item) => item.name),
    ).toContain('tenant_settings_tenant_id_mid_unique');
    expect(
      getTableConfig(folders).indexes.map((item) => item.config.name),
    ).toEqual(
      expect.arrayContaining([
        'folders_tenant_id_idx',
        'folders_user_id_idx',
        'folders_parent_id_idx',
        'folders_visibility_idx',
      ]),
    );
    expect(
      getTableConfig(queryVersions).indexes.map((item) => item.config.name),
    ).toEqual(
      expect.arrayContaining([
        'query_versions_saved_query_id_idx',
        'query_versions_tenant_id_idx',
        'query_versions_created_at_idx',
      ]),
    );
  });
});
