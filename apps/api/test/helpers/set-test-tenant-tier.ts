import type { Sql } from 'postgres';

export async function setTestTenantTier(
  sqlClient: Sql,
  tenantId: string,
  tier: 'free' | 'pro' | 'enterprise',
): Promise<void> {
  const trialEndsAt =
    tier === 'free'
      ? null
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  await sqlClient.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx`
      INSERT INTO org_subscriptions (tenant_id, tier, trial_ends_at)
      VALUES (${tenantId}::uuid, ${tier}, ${trialEndsAt})
      ON CONFLICT (tenant_id) DO UPDATE
        SET tier = ${tier}, trial_ends_at = ${trialEndsAt}
    `;
  });
}

/**
 * Deletes org_subscriptions for a tenant (FK-safe cleanup before tenant deletion).
 * Uses a transaction with RLS context since org_subscriptions has FORCE ROW LEVEL SECURITY.
 */
export async function deleteTestTenantSubscription(
  sqlClient: Sql,
  tenantId: string,
): Promise<void> {
  await sqlClient.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx`DELETE FROM org_subscriptions WHERE tenant_id = ${tenantId}::uuid`;
  });
  await sqlClient`DELETE FROM stripe_billing_bindings WHERE tenant_id = ${tenantId}::uuid`;
  await sqlClient`DELETE FROM stripe_checkout_sessions WHERE tenant_id = ${tenantId}::uuid`;
}
