import { Test, TestingModule } from '@nestjs/testing';
import type {
  IOrgSubscriptionRepository,
  OrgSubscription,
} from '@qpp/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../../audit/audit.service';
import { TrialService } from '../trial.service';

function createMockOrgSubscriptionRepo() {
  return {
    findByTenantId: vi.fn(),
    findByStripeCustomerId: vi.fn(),
    upsert: vi.fn(),
    insertIfNotExists: vi.fn(),
    updateTierByTenantId: vi.fn(),
    updateFromWebhook: vi.fn(),
  } satisfies Record<
    keyof IOrgSubscriptionRepository,
    ReturnType<typeof vi.fn>
  >;
}

function createMockAuditService() {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  };
}

const TENANT_ID = 'tenant-123';
const AUDIT_CONTEXT = { actorId: 'user-456', mid: 'mid-789' };

describe('TrialService', () => {
  let service: TrialService;
  let orgSubscriptionRepo: ReturnType<typeof createMockOrgSubscriptionRepo>;
  let auditService: ReturnType<typeof createMockAuditService>;
  let originalDateNow: () => number;

  beforeEach(async () => {
    orgSubscriptionRepo = createMockOrgSubscriptionRepo();
    auditService = createMockAuditService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrialService,
        {
          provide: 'ORG_SUBSCRIPTION_REPOSITORY',
          useValue: orgSubscriptionRepo,
        },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<TrialService>(TrialService);
    originalDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe('activateTrial()', () => {
    it('creates org_subscriptions row with 14-day pro trial for new org', async () => {
      // Arrange
      const fixedNow = 1700000000000;
      Date.now = () => fixedNow;
      orgSubscriptionRepo.insertIfNotExists.mockResolvedValue(true);

      // Act
      await service.activateTrial(TENANT_ID, AUDIT_CONTEXT);

      // Assert
      expect(orgSubscriptionRepo.insertIfNotExists).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        tier: 'pro',
        trialEndsAt: new Date(fixedNow + 14 * 24 * 60 * 60 * 1000),
        seatLimit: null,
      });
    });

    it('logs audit event when trial is newly activated', async () => {
      // Arrange
      orgSubscriptionRepo.insertIfNotExists.mockResolvedValue(true);

      // Act
      await service.activateTrial(TENANT_ID, AUDIT_CONTEXT);

      // Assert
      expect(auditService.log).toHaveBeenCalledWith({
        eventType: 'subscription.trial_activated',
        actorType: 'user',
        actorId: AUDIT_CONTEXT.actorId,
        tenantId: TENANT_ID,
        mid: AUDIT_CONTEXT.mid,
        targetId: TENANT_ID,
      });
    });

    it('does not log audit event when subscription already exists', async () => {
      // Arrange
      orgSubscriptionRepo.insertIfNotExists.mockResolvedValue(false);

      // Act
      await service.activateTrial(TENANT_ID, AUDIT_CONTEXT);

      // Assert
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('handles race condition safely — concurrent calls both succeed', async () => {
      // Arrange: first call inserts, second is a no-op
      orgSubscriptionRepo.insertIfNotExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      // Act
      const [result1, result2] = await Promise.all([
        service.activateTrial(TENANT_ID, AUDIT_CONTEXT),
        service.activateTrial(TENANT_ID, AUDIT_CONTEXT),
      ]);

      // Assert: both resolve without error
      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();
      expect(orgSubscriptionRepo.insertIfNotExists).toHaveBeenCalledTimes(2);
      expect(auditService.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTrialState()', () => {
    it('returns null when no subscription exists', async () => {
      // Arrange
      orgSubscriptionRepo.findByTenantId.mockResolvedValue(undefined);

      // Act
      const result = await service.getTrialState(TENANT_ID);

      // Assert
      expect(result).toBeNull();
    });

    it('returns null when subscription has no trialEndsAt (paid subscription)', async () => {
      // Arrange
      orgSubscriptionRepo.findByTenantId.mockResolvedValue({
        id: 'sub-1',
        tenantId: TENANT_ID,
        tier: 'pro',
        trialEndsAt: null,
        stripeSubscriptionId: 'sub_stripe_123',
        stripeCustomerId: 'cus_123',
        seatLimit: 10,
        currentPeriodEnds: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies OrgSubscription);

      // Act
      const result = await service.getTrialState(TENANT_ID);

      // Assert
      expect(result).toBeNull();
    });

    it('returns active trial state when trialEndsAt is in the future', async () => {
      // Arrange
      const fixedNow = 1700000000000;
      Date.now = () => fixedNow;
      const fiveDaysFromNow = new Date(fixedNow + 5 * 24 * 60 * 60 * 1000);

      orgSubscriptionRepo.findByTenantId.mockResolvedValue({
        id: 'sub-1',
        tenantId: TENANT_ID,
        tier: 'pro',
        trialEndsAt: fiveDaysFromNow,
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        seatLimit: null,
        currentPeriodEnds: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies OrgSubscription);

      // Act
      const result = await service.getTrialState(TENANT_ID);

      // Assert
      expect(result).toEqual({
        active: true,
        daysRemaining: 5,
        endsAt: fiveDaysFromNow.toISOString(),
      });
    });

    it('returns expired trial state when trialEndsAt is in the past', async () => {
      // Arrange
      const fixedNow = 1700000000000;
      Date.now = () => fixedNow;
      const twoDaysAgo = new Date(fixedNow - 2 * 24 * 60 * 60 * 1000);

      orgSubscriptionRepo.findByTenantId.mockResolvedValue({
        id: 'sub-1',
        tenantId: TENANT_ID,
        tier: 'pro',
        trialEndsAt: twoDaysAgo,
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        seatLimit: null,
        currentPeriodEnds: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies OrgSubscription);

      // Act
      const result = await service.getTrialState(TENANT_ID);

      // Assert
      expect(result).toEqual({
        active: false,
        daysRemaining: 0,
        endsAt: twoDaysAgo.toISOString(),
      });
    });

    it('rounds daysRemaining up (partial day counts as 1)', async () => {
      // Arrange
      const fixedNow = 1700000000000;
      Date.now = () => fixedNow;
      const oneHourFromNow = new Date(fixedNow + 60 * 60 * 1000);

      orgSubscriptionRepo.findByTenantId.mockResolvedValue({
        id: 'sub-1',
        tenantId: TENANT_ID,
        tier: 'pro',
        trialEndsAt: oneHourFromNow,
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        seatLimit: null,
        currentPeriodEnds: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies OrgSubscription);

      // Act
      const result = await service.getTrialState(TENANT_ID);

      // Assert
      expect(result).toEqual({
        active: true,
        daysRemaining: 1,
        endsAt: oneHourFromNow.toISOString(),
      });
    });
  });
});
