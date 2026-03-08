import * as backendShared from '@qpp/backend-shared';
import {
  DrizzleOrgSubscriptionRepository,
  type IOrgSubscriptionRepository,
} from '@qpp/database';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createContextAwareOrgSubscriptionRepository } from '../context-aware-org-subscription.repository';

vi.mock('@qpp/backend-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qpp/backend-shared')>();
  return {
    ...actual,
    getDbFromContext: vi.fn(),
  };
});

const mockedGetDbFromContext = vi.mocked(backendShared.getDbFromContext);

function createMockDb() {
  return {} as unknown as PostgresJsDatabase;
}

describe('createContextAwareOrgSubscriptionRepository', () => {
  let injectedDb: PostgresJsDatabase;
  let contextDb: PostgresJsDatabase;
  let repo: IOrgSubscriptionRepository;

  beforeEach(() => {
    injectedDb = createMockDb();
    contextDb = createMockDb();
    repo = createContextAwareOrgSubscriptionRepository(injectedDb);
    mockedGetDbFromContext.mockReset();
  });

  it('uses context DB when available', async () => {
    // Arrange
    mockedGetDbFromContext.mockReturnValue(contextDb);
    const findSpy = vi
      .spyOn(DrizzleOrgSubscriptionRepository.prototype, 'findByTenantId')
      .mockResolvedValue(undefined);

    // Act
    await repo.findByTenantId('tenant-1');

    // Assert
    expect(mockedGetDbFromContext).toHaveBeenCalled();
    expect(findSpy).toHaveBeenCalledWith('tenant-1');
    findSpy.mockRestore();
  });

  it('falls back to injected DB when no context', async () => {
    // Arrange
    mockedGetDbFromContext.mockReturnValue(undefined);
    const findSpy = vi
      .spyOn(DrizzleOrgSubscriptionRepository.prototype, 'findByTenantId')
      .mockResolvedValue(undefined);

    // Act
    await repo.findByTenantId('tenant-1');

    // Assert
    expect(mockedGetDbFromContext).toHaveBeenCalled();
    expect(findSpy).toHaveBeenCalledWith('tenant-1');
    findSpy.mockRestore();
  });

  it('delegates method calls with correct arguments', async () => {
    // Arrange
    mockedGetDbFromContext.mockReturnValue(contextDb);
    const updateSpy = vi
      .spyOn(DrizzleOrgSubscriptionRepository.prototype, 'updateTierByTenantId')
      .mockResolvedValue(undefined);

    // Act
    await repo.updateTierByTenantId('tenant-1', 'enterprise');

    // Assert
    expect(updateSpy).toHaveBeenCalledWith('tenant-1', 'enterprise');
    updateSpy.mockRestore();
  });

  it('delegates insertIfNotExists to the active repository instance', async () => {
    mockedGetDbFromContext.mockReturnValue(contextDb);
    const insertSpy = vi
      .spyOn(DrizzleOrgSubscriptionRepository.prototype, 'insertIfNotExists')
      .mockResolvedValue(true);

    const inserted = await repo.insertIfNotExists({
      tenantId: 'tenant-1',
      tier: 'free',
    });

    expect(inserted).toBe(true);
    expect(insertSpy).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      tier: 'free',
    });
    insertSpy.mockRestore();
  });

  it('delegates updateFromWebhook to the active repository instance', async () => {
    mockedGetDbFromContext.mockReturnValue(undefined);
    const updateSpy = vi
      .spyOn(DrizzleOrgSubscriptionRepository.prototype, 'updateFromWebhook')
      .mockResolvedValue(undefined);

    await repo.updateFromWebhook('tenant-1', {
      stripeSubscriptionStatus: 'active',
    });

    expect(updateSpy).toHaveBeenCalledWith('tenant-1', {
      stripeSubscriptionStatus: 'active',
    });
    updateSpy.mockRestore();
  });

  it('creates a new repo instance per call when context DB is present', async () => {
    // Arrange
    mockedGetDbFromContext.mockReturnValue(contextDb);
    const findSpy = vi
      .spyOn(DrizzleOrgSubscriptionRepository.prototype, 'findByTenantId')
      .mockResolvedValue(undefined);

    // Act
    await repo.findByTenantId('tenant-1');
    await repo.findByTenantId('tenant-2');

    // Assert — each call creates a fresh repo from context DB
    expect(findSpy).toHaveBeenCalledTimes(2);
    findSpy.mockRestore();
  });
});
