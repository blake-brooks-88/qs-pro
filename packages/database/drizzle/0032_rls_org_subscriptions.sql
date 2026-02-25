-- Data migration: populate org_subscriptions from existing tenants
-- Idempotent: uses NOT EXISTS to skip tenants already in org_subscriptions
INSERT INTO org_subscriptions (tenant_id, tier, seat_limit, created_at, updated_at)
SELECT id, subscription_tier, seat_limit, installed_at, NOW()
FROM tenants
WHERE NOT EXISTS (
  SELECT 1 FROM org_subscriptions WHERE org_subscriptions.tenant_id = tenants.id
);
