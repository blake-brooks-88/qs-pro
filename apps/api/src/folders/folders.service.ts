import { Inject, Injectable } from '@nestjs/common';
import { AppError, ErrorCode, RlsContextService } from '@qpp/backend-shared';
import type { CreateFolderDto, UpdateFolderDto } from '@qpp/shared-types';

import { FeaturesService } from '../features/features.service';
import type { Folder, FoldersRepository } from './folders.repository';

@Injectable()
export class FoldersService {
  constructor(
    @Inject('FOLDERS_REPOSITORY')
    private readonly foldersRepository: FoldersRepository,
    private readonly rlsContext: RlsContextService,
    private readonly featuresService: FeaturesService,
  ) {}

  async create(
    tenantId: string,
    mid: string,
    userId: string,
    dto: CreateFolderDto,
  ): Promise<Folder> {
    const visibility = dto.visibility ?? 'personal';

    if (visibility === 'shared') {
      await this.requireTeamCollaboration(tenantId);
    }

    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        if (dto.parentId) {
          const parent = await this.foldersRepository.findById(dto.parentId);
          if (!parent) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
              operation: 'create_folder',
              reason: `Parent folder not found: ${dto.parentId}`,
            });
          }
        }

        return this.foldersRepository.create({
          tenantId,
          mid,
          userId,
          name: dto.name,
          parentId: dto.parentId ?? null,
          visibility,
        });
      },
    );
  }

  async findAll(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<Folder[]> {
    return this.rlsContext.runWithUserContext(tenantId, mid, userId, () =>
      this.foldersRepository.findAll(),
    );
  }

  async findById(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
  ): Promise<Folder> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const folder = await this.foldersRepository.findById(id);
        if (!folder) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'find_folder',
            reason: `Folder not found: ${id}`,
          });
        }
        return folder;
      },
    );
  }

  async update(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
    dto: UpdateFolderDto,
  ): Promise<Folder> {
    if (dto.visibility === 'shared') {
      await this.requireTeamCollaboration(tenantId);
    }

    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const existing = await this.foldersRepository.findById(id);
        if (!existing) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'update_folder',
            reason: `Folder not found: ${id}`,
          });
        }

        if (existing.visibility === 'shared') {
          await this.requireTeamCollaboration(tenantId);
        }

        if (
          dto.visibility === 'shared' &&
          existing.visibility !== 'shared' &&
          existing.userId !== userId
        ) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
            reason: 'Only the folder creator can share a folder',
          });
        }

        if (dto.parentId) {
          if (dto.parentId === id) {
            throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
              reason: 'Folder cannot be its own parent',
            });
          }
          const wouldCycle = await this.foldersRepository.wouldCreateCycle(
            id,
            dto.parentId,
          );
          if (wouldCycle) {
            throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
              reason: 'Cannot move folder: would create circular reference',
            });
          }
          const parent = await this.foldersRepository.findById(dto.parentId);
          if (!parent) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
              operation: 'update_folder',
              reason: `Parent folder not found: ${dto.parentId}`,
            });
          }
        }

        const folder = await this.foldersRepository.update(id, dto);
        if (!folder) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'update_folder',
            reason: `Folder not found: ${id}`,
          });
        }
        return folder;
      },
    );
  }

  async shareFolder(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
  ): Promise<Folder> {
    await this.requireTeamCollaboration(tenantId);

    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const folder = await this.foldersRepository.findById(id);
        if (!folder) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'share_folder',
            reason: `Folder not found: ${id}`,
          });
        }

        if (folder.userId !== userId) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
            reason: 'Only the folder creator can share a folder',
          });
        }

        if (folder.visibility === 'shared') {
          return folder;
        }

        const updated = await this.foldersRepository.update(id, {
          visibility: 'shared',
        });
        if (!updated) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'share_folder',
            reason: `Folder not found: ${id}`,
          });
        }
        return updated;
      },
    );
  }

  async delete(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
  ): Promise<void> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const existing = await this.foldersRepository.findById(id);
        if (!existing) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'delete_folder',
            reason: `Folder not found: ${id}`,
          });
        }

        if (existing.visibility === 'shared') {
          await this.requireTeamCollaboration(tenantId);
        }

        const hasChildren = await this.foldersRepository.hasChildren(id);
        if (hasChildren) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
            reason: 'Cannot delete folder with contents',
          });
        }

        const deleted = await this.foldersRepository.delete(id);
        if (!deleted) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'delete_folder',
            reason: `Folder not found: ${id}`,
          });
        }
      },
    );
  }

  private async requireTeamCollaboration(tenantId: string): Promise<void> {
    const { features } = await this.featuresService.getTenantFeatures(tenantId);
    if (!features.teamCollaboration) {
      throw new AppError(ErrorCode.FEATURE_NOT_ENABLED, undefined, {
        reason: 'Team collaboration requires an Enterprise subscription',
      });
    }
  }
}
