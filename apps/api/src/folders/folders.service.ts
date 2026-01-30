import { Inject, Injectable } from '@nestjs/common';
import { AppError, ErrorCode, RlsContextService } from '@qpp/backend-shared';
import type { CreateFolderDto, UpdateFolderDto } from '@qpp/shared-types';

import type { Folder, FoldersRepository } from './folders.repository';

@Injectable()
export class FoldersService {
  constructor(
    @Inject('FOLDERS_REPOSITORY')
    private readonly foldersRepository: FoldersRepository,
    private readonly rlsContext: RlsContextService,
  ) {}

  async create(
    tenantId: string,
    mid: string,
    userId: string,
    dto: CreateFolderDto,
  ): Promise<Folder> {
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
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        if (dto.parentId) {
          if (dto.parentId === id) {
            throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
              reason: 'Folder cannot be its own parent',
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
}
