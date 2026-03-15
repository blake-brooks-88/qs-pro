import { Inject, Injectable } from '@nestjs/common';
import { AppError, ErrorCode, RlsContextService } from '@qpp/backend-shared';
import { EncryptionService } from '@qpp/backend-shared';
import type {
  createDatabaseFromClient,
  ICredentialsRepository,
} from '@qpp/database';
import {
  and,
  eq,
  folders,
  savedQueries,
  shellQueryRuns,
  snippets,
  users,
} from '@qpp/database';

type Database = ReturnType<typeof createDatabaseFromClient>;

export interface GdprDataExport {
  exportedAt: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    sfUserId: string;
    role: string;
    createdAt: string | null;
  };
  savedQueries: Array<{
    id: string;
    mid: string;
    name: string;
    sql: string;
    folderId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  folders: Array<{
    id: string;
    mid: string;
    name: string;
    visibility: string;
    parentId: string | null;
    createdAt: string;
  }>;
  snippets: Array<{
    id: string;
    mid: string;
    title: string;
    code: string;
    isShared: boolean;
    createdAt: string | null;
  }>;
  queryExecutionHistory: Array<{
    id: string;
    mid: string;
    sql: string;
    status: string;
    rowCount: number | null;
    createdAt: string;
    completedAt: string | null;
  }>;
}

@Injectable()
export class DataExportService {
  constructor(
    @Inject('DATABASE')
    private readonly db: Database,
    private readonly encryptionService: EncryptionService,
    private readonly rlsContext: RlsContextService,
    @Inject('CREDENTIALS_REPOSITORY')
    private readonly credRepo: ICredentialsRepository,
  ) {}

  async exportUserData(
    tenantId: string,
    callerMid: string,
    userId: string,
  ): Promise<GdprDataExport> {
    // Fetch user outside RLS context (users table has no RLS)
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);

    if (!user) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        reason: `User not found: ${userId}`,
      });
    }

    // Collect data across all MIDs for complete GDPR export.
    // Always include the caller's MID as fallback in case there are no
    // credentials rows (e.g. data seeded without a login credential).
    const discoveredMids =
      await this.credRepo.findDistinctMidsByTenantId(tenantId);
    const mids = discoveredMids.includes(callerMid)
      ? discoveredMids
      : [callerMid, ...discoveredMids];

    const allQueries: GdprDataExport['savedQueries'] = [];
    const allFolders: GdprDataExport['folders'] = [];
    const allRuns: GdprDataExport['queryExecutionHistory'] = [];
    const allSnippets: GdprDataExport['snippets'] = [];

    for (const mid of mids) {
      await this.rlsContext.runWithIsolatedUserContext(
        tenantId,
        mid,
        userId,
        async () => {
          const midQueries = await this.db
            .select({
              id: savedQueries.id,
              name: savedQueries.name,
              sqlTextEncrypted: savedQueries.sqlTextEncrypted,
              folderId: savedQueries.folderId,
              createdAt: savedQueries.createdAt,
              updatedAt: savedQueries.updatedAt,
            })
            .from(savedQueries)
            .where(
              and(
                eq(savedQueries.userId, userId),
                eq(savedQueries.tenantId, tenantId),
              ),
            );

          allQueries.push(
            ...midQueries.map((q) => ({
              id: q.id,
              mid,
              name: q.name,
              sql:
                (this.encryptionService.decrypt(
                  q.sqlTextEncrypted,
                ) as string) ?? '',
              folderId: q.folderId ?? null,
              createdAt: q.createdAt.toISOString(),
              updatedAt: q.updatedAt.toISOString(),
            })),
          );

          const midFolders = await this.db
            .select({
              id: folders.id,
              name: folders.name,
              visibility: folders.visibility,
              parentId: folders.parentId,
              createdAt: folders.createdAt,
            })
            .from(folders)
            .where(
              and(eq(folders.userId, userId), eq(folders.tenantId, tenantId)),
            );

          allFolders.push(
            ...midFolders.map((f) => ({
              id: f.id,
              mid,
              name: f.name,
              visibility: f.visibility,
              parentId: f.parentId ?? null,
              createdAt: f.createdAt.toISOString(),
            })),
          );

          const midRuns = await this.db
            .select({
              id: shellQueryRuns.id,
              sqlTextEncrypted: shellQueryRuns.sqlTextEncrypted,
              status: shellQueryRuns.status,
              rowCount: shellQueryRuns.rowCount,
              createdAt: shellQueryRuns.createdAt,
              completedAt: shellQueryRuns.completedAt,
            })
            .from(shellQueryRuns)
            .where(
              and(
                eq(shellQueryRuns.userId, userId),
                eq(shellQueryRuns.tenantId, tenantId),
              ),
            );

          allRuns.push(
            ...midRuns.map((r) => ({
              id: r.id,
              mid,
              sql:
                (this.encryptionService.decrypt(
                  r.sqlTextEncrypted,
                ) as string) ?? '',
              status: r.status,
              rowCount: r.rowCount ?? null,
              createdAt: r.createdAt.toISOString(),
              completedAt: r.completedAt?.toISOString() ?? null,
            })),
          );

          const midSnippets = await this.db
            .select({
              id: snippets.id,
              title: snippets.title,
              code: snippets.code,
              isShared: snippets.isShared,
              createdAt: snippets.createdAt,
            })
            .from(snippets)
            .where(
              and(eq(snippets.userId, userId), eq(snippets.tenantId, tenantId)),
            );

          allSnippets.push(
            ...midSnippets.map((s) => ({
              id: s.id,
              mid,
              title: s.title,
              code: s.code,
              isShared: s.isShared ?? false,
              createdAt: s.createdAt?.toISOString() ?? null,
            })),
          );
        },
      );
    }

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email ?? null,
        name: user.name ?? null,
        sfUserId: user.sfUserId,
        role: user.role,
        createdAt: user.createdAt?.toISOString() ?? null,
      },
      savedQueries: allQueries,
      folders: allFolders,
      snippets: allSnippets,
      queryExecutionHistory: allRuns,
    };
  }
}
