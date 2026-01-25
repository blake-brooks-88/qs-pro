/**
 * Features Remaining Gaps Integration Tests
 *
 * This test file covers remaining unchecked behaviors from surface-area/features.md:
 *
 * FeaturesService.getTenantFeatures:
 * - Error: Tenant not found throws RESOURCE_NOT_FOUND
 * - Edge case: Invalid featureKey in override is ignored (doesn't throw)
 *
 * Note: The "missing subscriptionTier" test case is not possible in production
 * because the database has a NOT NULL constraint with default 'free'.
 *
 * Test Strategy:
 * - Uses FeaturesService directly with test database
 * - Behavioral assertions on error types and response codes
 * - No internal mocking
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AppError } from '@qpp/backend-shared';
import { tenants } from '@qpp/database';
import { eq } from 'drizzle-orm';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FeaturesService } from '../features.service';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- `key` is a trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

describe('Features Remaining Gaps (integration)', () => {
  let featuresService: FeaturesService;

  // Direct database access for setup and cleanup
  let db: PostgresJsDatabase;
  let client: postgres.Sql;

  // Track created entities for cleanup
  const createdTenantEids: string[] = [];

  beforeAll(async () => {
    // Direct database connection for test setup
    client = postgres(getRequiredEnv('DATABASE_URL'));
    db = drizzle(client);

    // Create a minimal test module with real database-backed repositories
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeaturesService,
        {
          provide: 'TENANT_REPOSITORY',
          useValue: {
            findById: async (id: string) => {
              const [tenant] = await db
                .select()
                .from(tenants)
                .where(eq(tenants.id, id));
              return tenant ?? null;
            },
          },
        },
        {
          provide: 'FEATURE_OVERRIDE_REPOSITORY',
          useValue: {
            findByTenantId: async (tenantId: string) => {
              // Use raw SQL with RLS context set to read overrides
              return client.begin(async (tx) => {
                await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
                const result = await tx`
                  SELECT id, tenant_id as "tenantId", feature_key as "featureKey",
                         enabled, created_at as "createdAt"
                  FROM tenant_feature_overrides
                  WHERE tenant_id = ${tenantId}
                `;
                return result;
              });
            },
          },
        },
      ],
    }).compile();

    featuresService = module.get<FeaturesService>(FeaturesService);
  });

  afterAll(async () => {
    // Clean up test data
    for (const eid of createdTenantEids) {
      try {
        // Delete overrides first (FK constraint)
        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.eid, eid));
        if (tenant) {
          await client.unsafe(
            'DELETE FROM tenant_feature_overrides WHERE tenant_id = $1',
            [tenant.id],
          );
        }
        await client.unsafe('DELETE FROM tenants WHERE eid = $1', [eid]);
      } catch {
        // Ignore cleanup errors
      }
    }

    await client.end();
  });

  describe('FeaturesService.getTenantFeatures', () => {
    it('should throw RESOURCE_NOT_FOUND when tenant not found', async () => {
      // Use a UUID that doesn't exist
      const nonExistentTenantId = '00000000-0000-0000-0000-000000000000';

      await expect(
        featuresService.getTenantFeatures(nonExistentTenantId),
      ).rejects.toThrow(AppError);

      await expect(
        featuresService.getTenantFeatures(nonExistentTenantId),
      ).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should ignore invalid featureKey in overrides without throwing', async () => {
      const uniqueEid = `invalid-key-eid-${Date.now()}`;
      createdTenantEids.push(uniqueEid);

      // Insert tenant with free tier (using Drizzle)
      const [tenant] = await db
        .insert(tenants)
        .values({
          eid: uniqueEid,
          tssd: 'test-tssd',
          subscriptionTier: 'free',
        })
        .returning();

      // Insert invalid override with RLS context set
      // We need to set app.tenant_id in a transaction before the insert to satisfy RLS
      await client.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
        await tx`
          INSERT INTO tenant_feature_overrides (tenant_id, feature_key, enabled)
          VALUES (${tenant.id}, ${'TOTALLY_INVALID_KEY_THAT_DOES_NOT_EXIST'}, ${true})
        `;
      });

      // Should not throw - invalid key should be ignored
      const features = await featuresService.getTenantFeatures(tenant.id);

      // Verify features are returned (free tier defaults)
      expect(features).toBeDefined();
      expect(features.basicLinting).toBe(true);
      expect(features.syntaxHighlighting).toBe(true);

      // Invalid key should NOT appear in the result (it's ignored)
      expect(features).not.toHaveProperty(
        'TOTALLY_INVALID_KEY_THAT_DOES_NOT_EXIST',
      );
    });

    it('should apply valid override and return correct features', async () => {
      const uniqueEid = `valid-override-eid-${Date.now()}`;
      createdTenantEids.push(uniqueEid);

      // Insert tenant with free tier
      const [tenant] = await db
        .insert(tenants)
        .values({
          eid: uniqueEid,
          tssd: 'test-tssd',
          subscriptionTier: 'free',
        })
        .returning();

      // Insert valid override with RLS context set
      await client.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
        await tx`
          INSERT INTO tenant_feature_overrides (tenant_id, feature_key, enabled)
          VALUES (${tenant.id}, ${'quickFixes'}, ${true})
        `;
      });

      const features = await featuresService.getTenantFeatures(tenant.id);

      // Free tier defaults
      expect(features.basicLinting).toBe(true);
      expect(features.syntaxHighlighting).toBe(true);

      // Override applied - quickFixes enabled despite being free tier
      expect(features.quickFixes).toBe(true);

      // Other pro features NOT enabled
      expect(features.minimap).toBe(false);
      expect(features.advancedAutocomplete).toBe(false);
    });
  });
});
