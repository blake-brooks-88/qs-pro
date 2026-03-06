import type { ConfigService } from '@nestjs/config';
import type { EncryptionService } from '@qpp/backend-shared';
import { AppError, ErrorCode } from '@qpp/backend-shared';
import type { ITenantRepository } from '@qpp/database';
import type { FastifyRequest } from 'fastify';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BillingWebhookQueueService } from '../billing-webhook-queue.service';
import { BillingController } from '../billing.controller';

const TENANT_ID = 'tenant-abc-123';
const TENANT_EID = 'eid-org-456';
const ENCRYPTED_TOKEN = 'enc_opaque_token_xyz';

function createStripeMock() {
  return {
    webhooks: { constructEvent: vi.fn() },
  };
}

function createConfigMock() {
  return {
    get: vi.fn(),
    getOrThrow: vi.fn().mockReturnValue('whsec_test'),
  };
}

function createWebhookQueueMock() {
  return { enqueue: vi.fn().mockResolvedValue(undefined) };
}

function createEncryptionServiceMock() {
  return {
    encrypt: vi.fn().mockReturnValue(ENCRYPTED_TOKEN),
    decrypt: vi.fn(),
  };
}

function createTenantRepoMock() {
  return {
    findById: vi.fn().mockResolvedValue({ id: TENANT_ID, eid: TENANT_EID }),
    findByEid: vi.fn(),
    upsert: vi.fn(),
    countUsersByTenantId: vi.fn(),
  };
}

function createReqWithSession(tenantId?: string) {
  return {
    session: {
      get: vi.fn((key: string) => {
        if (key === 'tenantId') {
          return tenantId;
        }
        return undefined;
      }),
    },
  } as unknown as FastifyRequest;
}

describe('BillingController.getPricingToken', () => {
  let controller: BillingController;
  let encryptionMock: ReturnType<typeof createEncryptionServiceMock>;
  let tenantRepoMock: ReturnType<typeof createTenantRepoMock>;

  beforeEach(() => {
    encryptionMock = createEncryptionServiceMock();
    tenantRepoMock = createTenantRepoMock();

    controller = new BillingController(
      createStripeMock() as unknown as Stripe,
      createConfigMock() as unknown as ConfigService,
      createWebhookQueueMock() as unknown as BillingWebhookQueueService,
      encryptionMock as unknown as EncryptionService,
      tenantRepoMock as unknown as ITenantRepository,
    );
  });

  it('returns encrypted token for valid session', async () => {
    const req = createReqWithSession(TENANT_ID);

    const result = await controller.getPricingToken(req);

    expect(result).toEqual({ token: ENCRYPTED_TOKEN });
    expect(tenantRepoMock.findById).toHaveBeenCalledWith(TENANT_ID);
    expect(encryptionMock.encrypt).toHaveBeenCalledWith(TENANT_EID);
  });

  it('throws AUTH_UNAUTHORIZED when no tenantId in session', async () => {
    const req = createReqWithSession(undefined);

    try {
      await controller.getPricingToken(req);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.AUTH_UNAUTHORIZED);
    }

    expect(tenantRepoMock.findById).not.toHaveBeenCalled();
  });

  it('throws RESOURCE_NOT_FOUND when tenant not found in DB', async () => {
    tenantRepoMock.findById.mockResolvedValue(undefined);
    const req = createReqWithSession(TENANT_ID);

    try {
      await controller.getPricingToken(req);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    }
  });

  it('throws INTERNAL_ERROR when encryption returns null', async () => {
    encryptionMock.encrypt.mockReturnValue(null);
    const req = createReqWithSession(TENANT_ID);

    try {
      await controller.getPricingToken(req);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.INTERNAL_ERROR);
    }
  });
});
