import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';
import {
  type CreateFolderDto,
  CreateFolderSchema,
  type UpdateFolderDto,
  UpdateFolderSchema,
} from '@qpp/shared-types';

import { CsrfGuard } from '../auth/csrf.guard';
import { Audited } from '../common/decorators/audited.decorator';
import {
  CurrentUser,
  type UserSession,
} from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Folder } from './folders.repository';
import { FoldersService } from './folders.service';

@Controller('folders')
@UseGuards(SessionGuard)
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Post()
  @UseGuards(CsrfGuard)
  @Audited('folder.created')
  async create(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(CreateFolderSchema)) dto: CreateFolderDto,
  ) {
    const folder = await this.foldersService.create(
      user.tenantId,
      user.mid,
      user.userId,
      dto,
    );
    return this.toResponse(folder);
  }

  @Get()
  async findAll(@CurrentUser() user: UserSession) {
    const folders = await this.foldersService.findAll(
      user.tenantId,
      user.mid,
      user.userId,
    );
    return folders.map((f) => this.toResponse(f));
  }

  @Get(':id')
  async findById(
    @CurrentUser() user: UserSession,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const folder = await this.foldersService.findById(
      user.tenantId,
      user.mid,
      user.userId,
      id,
    );
    return this.toResponse(folder);
  }

  @Patch(':id')
  @UseGuards(CsrfGuard)
  @Audited('folder.updated', { targetIdParam: 'id', metadataFields: ['name'] })
  async update(
    @CurrentUser() user: UserSession,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(UpdateFolderSchema)) dto: UpdateFolderDto,
  ) {
    const folder = await this.foldersService.update(
      user.tenantId,
      user.mid,
      user.userId,
      id,
      dto,
    );
    return this.toResponse(folder);
  }

  @Post(':id/share')
  @UseGuards(CsrfGuard)
  @Audited('folder.shared', { targetIdParam: 'id' })
  async share(
    @CurrentUser() user: UserSession,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const folder = await this.foldersService.shareFolder(
      user.tenantId,
      user.mid,
      user.userId,
      id,
    );
    return this.toResponse(folder);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  @Audited('folder.deleted', { targetIdParam: 'id' })
  async delete(
    @CurrentUser() user: UserSession,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.foldersService.delete(user.tenantId, user.mid, user.userId, id);
    return { success: true };
  }

  private toResponse(folder: Folder) {
    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      visibility: folder.visibility,
      userId: folder.userId,
      creatorName: folder.creatorName,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    };
  }
}
