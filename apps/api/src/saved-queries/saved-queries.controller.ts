import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';
import {
  type CreateSavedQueryDto,
  CreateSavedQuerySchema,
  type UpdateSavedQueryDto,
  UpdateSavedQuerySchema,
} from '@qpp/shared-types';

import { CsrfGuard } from '../auth/csrf.guard';
import { Audited } from '../common/decorators/audited.decorator';
import {
  CurrentUser,
  type UserSession,
} from '../common/decorators/current-user.decorator';
import {
  type DecryptedSavedQuery,
  SavedQueriesService,
} from './saved-queries.service';

@Controller('saved-queries')
@UseGuards(SessionGuard)
export class SavedQueriesController {
  constructor(private readonly savedQueriesService: SavedQueriesService) {}

  @Post()
  @UseGuards(CsrfGuard)
  @Audited('saved_query.created')
  async create(@CurrentUser() user: UserSession, @Body() body: unknown) {
    const result = CreateSavedQuerySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }
    const dto: CreateSavedQueryDto = result.data;

    const query = await this.savedQueriesService.create(
      user.tenantId,
      user.mid,
      user.userId,
      dto,
    );
    return this.toResponse(query);
  }

  @Get()
  async findAll(@CurrentUser() user: UserSession) {
    const queries = await this.savedQueriesService.findAllListItems(
      user.tenantId,
      user.mid,
      user.userId,
    );
    return queries.map((q) => ({
      id: q.id,
      name: q.name,
      folderId: q.folderId,
      updatedAt: q.updatedAt.toISOString(),
      linkedQaCustomerKey: q.linkedQaCustomerKey,
      linkedQaName: q.linkedQaName,
      linkedAt: q.linkedAt?.toISOString() ?? null,
    }));
  }

  @Get('count')
  async count(@CurrentUser() user: UserSession) {
    const count = await this.savedQueriesService.countByUser(
      user.tenantId,
      user.mid,
      user.userId,
    );
    return { count };
  }

  @Get(':id')
  async findById(@CurrentUser() user: UserSession, @Param('id') id: string) {
    const query = await this.savedQueriesService.findById(
      user.tenantId,
      user.mid,
      user.userId,
      id,
    );
    return this.toResponse(query);
  }

  @Patch(':id')
  @UseGuards(CsrfGuard)
  @Audited('saved_query.updated', { targetIdParam: 'id' })
  async update(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const result = UpdateSavedQuerySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }
    const dto: UpdateSavedQueryDto = result.data;

    const query = await this.savedQueriesService.update(
      user.tenantId,
      user.mid,
      user.userId,
      id,
      dto,
    );
    return this.toResponse(query);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  @Audited('saved_query.deleted', { targetIdParam: 'id' })
  async delete(@CurrentUser() user: UserSession, @Param('id') id: string) {
    await this.savedQueriesService.delete(
      user.tenantId,
      user.mid,
      user.userId,
      id,
    );
    return { success: true };
  }

  private toResponse(query: DecryptedSavedQuery) {
    return {
      id: query.id,
      name: query.name,
      sqlText: query.sqlText,
      folderId: query.folderId,
      createdAt: query.createdAt.toISOString(),
      updatedAt: query.updatedAt.toISOString(),
      linkedQaObjectId: query.linkedQaObjectId,
      linkedQaCustomerKey: query.linkedQaCustomerKey,
      linkedQaName: query.linkedQaName,
      linkedAt: query.linkedAt?.toISOString() ?? null,
    };
  }
}
