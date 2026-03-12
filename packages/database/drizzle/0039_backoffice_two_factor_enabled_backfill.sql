-- Backfill Better Auth 2FA flag for existing users.
--
-- Better Auth uses `user.twoFactorEnabled` to decide whether to gate routes and
-- whether `/two-factor/verify-totp` needs to update the user record. If the
-- `bo_two_factors` row exists but `bo_users.two_factor_enabled` is still false
-- (e.g. the column was added after 2FA was already enabled), the backoffice UI
-- will continuously redirect users back to 2FA setup.

UPDATE "bo_users" u
SET "two_factor_enabled" = true,
    "updated_at" = now()
WHERE u."two_factor_enabled" IS DISTINCT FROM true
  AND EXISTS (
    SELECT 1
    FROM "bo_two_factors" tf
    WHERE tf."user_id" = u."id"
  );

