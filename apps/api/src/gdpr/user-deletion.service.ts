import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AppError,
  ErrorCode,
  getReservedSqlFromContext,
  RlsContextService,
} from '@qpp/backend-shared';
import type { IUserRepository } from '@qpp/database';
import type { createDatabaseFromClient } from '@qpp/database';
import {
  and,
  credentials,
  deletionLedger,
  eq,
  folders,
  isNull,
  queryPublishEvents,
  queryVersions,
  savedQueries,
  shellQueryRuns,
  snippets,
  users,
} from '@qpp/database';

import { AuditAnonymizationService } from './audit-anonymization.service';

type Database = ReturnType<typeof createDatabaseFromClient>;

interface DeleteUserParams {
  tenantId: string;
  mid: string;
  targetUserId: string;
  actorId: string;
}

@Injectable()
export class UserDeletionService {
  private readonly logger = new Logger(UserDeletionService.name);

  constructor(
    @Inject('DATABASE')
    private readonly db: Database,
    @Inject('USER_REPOSITORY')
    private readonly userRepo: IUserRepository,
    private readonly rlsContext: RlsContextService,
    private readonly auditAnonymizationService: AuditAnonymizationService,
  ) {}

  async deleteUser(params: DeleteUserParams): Promise<void> {
    const { tenantId, mid: callerMid, targetUserId, actorId } = params;

    const targetUser = await this.userRepo.findById(targetUserId);
    if (!targetUser) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        reason: `User not found: ${targetUserId}`,
      });
    }

    if (targetUser.tenantId !== tenantId) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
        reason: 'Target user does not belong to your organization.',
      });
    }

    if (targetUser.role === 'owner') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
        reason: 'Cannot delete the tenant owner. Transfer ownership first.',
      });
    }

    if (targetUserId === actorId) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
        reason: 'Cannot delete yourself.',
      });
    }

    await this.rlsContext.runWithIsolatedTenantContext(
      tenantId,
      callerMid,
      async () => {
        const reservedSql = getReservedSqlFromContext();

        const [owner] = await this.db
          .select()
          .from(users)
          .where(and(eq(users.tenantId, tenantId), eq(users.role, 'owner')));

        if (!owner) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            reason: 'Tenant owner not found.',
          });
        }

        const ownerId = owner.id;

        if (reservedSql) {
          await reservedSql`SELECT set_config('app.admin_action', 'true', true)`;
          await reservedSql`SELECT set_config('app.user_id', ${ownerId}, true)`;
        }

        const midRows = await this.db
          .selectDistinct({ mid: credentials.mid })
          .from(credentials)
          .where(
            and(
              eq(credentials.tenantId, tenantId),
              eq(credentials.userId, targetUserId),
            ),
          );
        const discoveredMids = midRows.map((r) => r.mid);
        const mids = discoveredMids.includes(callerMid)
          ? discoveredMids
          : [callerMid, ...discoveredMids];

        const archivedFolderIds: Record<string, string> = {};

        for (const mid of mids) {
          if (reservedSql) {
            await reservedSql`SELECT set_config('app.mid', ${mid}, true)`;
            await reservedSql`SELECT set_config('app.user_id', ${ownerId}, true)`;
          }

          const archiveRootFolderId = await this.findOrCreateArchiveRoot(
            tenantId,
            mid,
            ownerId,
          );

          const archiveSubfolderId = await this.createUserArchiveSubfolder(
            tenantId,
            mid,
            ownerId,
            archiveRootFolderId,
            targetUser.name ?? targetUser.sfUserId,
          );
          archivedFolderIds[mid] = archiveSubfolderId;

          await this.migrateContent(
            tenantId,
            mid,
            targetUserId,
            ownerId,
            archiveSubfolderId,
          );

          await this.auditAnonymizationService.anonymizeForUser(
            targetUserId,
            tenantId,
            mid,
          );
        }

        await this.handleSnippets(targetUserId, ownerId);

        await this.nullOutVersionsAndEvents(targetUserId);

        await this.db
          .delete(credentials)
          .where(eq(credentials.userId, targetUserId));

        await this.db.delete(users).where(eq(users.id, targetUserId));

        await this.db.insert(deletionLedger).values({
          entityType: 'user',
          entityId: targetUserId,
          entityIdentifier: null,
          deletedBy: `admin:${actorId}`,
          metadata: { tenantId, archivedFolderIds },
        });

        this.logger.log(
          `User deleted: userId=${targetUserId} tenant=${tenantId} mids=${mids.join(',')} archivedFolderIds=${JSON.stringify(archivedFolderIds)}`,
        );
      },
    );
  }

  private async findOrCreateArchiveRoot(
    tenantId: string,
    mid: string,
    ownerId: string,
  ): Promise<string> {
    const [existing] = await this.db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.tenantId, tenantId),
          eq(folders.mid, mid),
          eq(folders.name, 'Archived Users'),
          eq(folders.visibility, 'personal'),
          eq(folders.userId, ownerId),
          isNull(folders.parentId),
        ),
      );

    if (existing) {
      return existing.id;
    }

    const [created] = await this.db
      .insert(folders)
      .values({
        tenantId,
        mid,
        userId: ownerId,
        name: 'Archived Users',
        visibility: 'personal',
        parentId: null,
      })
      .returning({ id: folders.id });

    if (!created) {
      throw new Error('Failed to create archive root folder');
    }
    return created.id;
  }

  private async createUserArchiveSubfolder(
    tenantId: string,
    mid: string,
    ownerId: string,
    parentId: string,
    userName: string,
  ): Promise<string> {
    const [created] = await this.db
      .insert(folders)
      .values({
        tenantId,
        mid,
        userId: ownerId,
        name: userName,
        visibility: 'personal',
        parentId,
      })
      .returning({ id: folders.id });

    if (!created) {
      throw new Error('Failed to create user archive subfolder');
    }
    return created.id;
  }

  private async migrateContent(
    tenantId: string,
    mid: string,
    targetUserId: string,
    ownerId: string,
    archiveSubfolderId: string,
  ): Promise<void> {
    const personalFolders = await this.db
      .select({ id: folders.id, parentId: folders.parentId })
      .from(folders)
      .where(
        and(
          eq(folders.tenantId, tenantId),
          eq(folders.mid, mid),
          eq(folders.userId, targetUserId),
          eq(folders.visibility, 'personal'),
        ),
      );

    const personalFolderIds = new Set(personalFolders.map((f) => f.id));

    const topLevelPersonalFolders = personalFolders.filter(
      (f) => f.parentId === null || !personalFolderIds.has(f.parentId),
    );

    for (const folder of topLevelPersonalFolders) {
      await this.db
        .update(folders)
        .set({ parentId: archiveSubfolderId, userId: ownerId })
        .where(eq(folders.id, folder.id));
    }

    const descendantFolderIds = personalFolders
      .filter((f) => !topLevelPersonalFolders.includes(f))
      .map((f) => f.id);

    for (const folderId of descendantFolderIds) {
      await this.db
        .update(folders)
        .set({ userId: ownerId })
        .where(eq(folders.id, folderId));
    }

    await this.db
      .update(folders)
      .set({ userId: null })
      .where(
        and(
          eq(folders.tenantId, tenantId),
          eq(folders.mid, mid),
          eq(folders.userId, targetUserId),
          eq(folders.visibility, 'shared'),
        ),
      );

    const allPersonalFolderIds = [...personalFolderIds];
    for (const folderId of allPersonalFolderIds) {
      await this.db
        .update(savedQueries)
        .set({ userId: ownerId })
        .where(
          and(
            eq(savedQueries.folderId, folderId),
            eq(savedQueries.userId, targetUserId),
          ),
        );
    }

    await this.db
      .update(savedQueries)
      .set({ folderId: archiveSubfolderId, userId: ownerId })
      .where(
        and(
          isNull(savedQueries.folderId),
          eq(savedQueries.userId, targetUserId),
          eq(savedQueries.tenantId, tenantId),
        ),
      );

    await this.db
      .update(savedQueries)
      .set({ userId: null })
      .where(eq(savedQueries.userId, targetUserId));

    await this.db
      .update(savedQueries)
      .set({ updatedByUserId: null })
      .where(eq(savedQueries.updatedByUserId, targetUserId));
  }

  private async handleSnippets(
    targetUserId: string,
    ownerId: string,
  ): Promise<void> {
    await this.db
      .update(snippets)
      .set({ userId: ownerId })
      .where(
        and(eq(snippets.userId, targetUserId), eq(snippets.isShared, false)),
      );

    await this.db
      .update(snippets)
      .set({ userId: null })
      .where(
        and(eq(snippets.userId, targetUserId), eq(snippets.isShared, true)),
      );
  }

  private async nullOutVersionsAndEvents(targetUserId: string): Promise<void> {
    await this.db
      .update(queryVersions)
      .set({ userId: null })
      .where(eq(queryVersions.userId, targetUserId));

    await this.db
      .update(queryPublishEvents)
      .set({ userId: null })
      .where(eq(queryPublishEvents.userId, targetUserId));

    await this.db
      .update(shellQueryRuns)
      .set({ userId: null })
      .where(eq(shellQueryRuns.userId, targetUserId));
  }
}
