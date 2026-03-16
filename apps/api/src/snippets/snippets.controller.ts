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
  type CreateSnippetDto,
  CreateSnippetSchema,
  type UpdateSnippetDto,
  UpdateSnippetSchema,
} from '@qpp/shared-types';

import { CsrfGuard } from '../auth/csrf.guard';
import { Audited } from '../common/decorators/audited.decorator';
import {
  CurrentUser,
  type UserSession,
} from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Snippet, SnippetListItem } from './snippets.repository';
import { SnippetsService } from './snippets.service';

@Controller('snippets')
@UseGuards(SessionGuard)
export class SnippetsController {
  constructor(private readonly snippetsService: SnippetsService) {}

  @Post()
  @UseGuards(CsrfGuard)
  @Audited('snippet.created')
  async create(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(CreateSnippetSchema)) dto: CreateSnippetDto,
  ) {
    const snippet = await this.snippetsService.create(
      user.tenantId,
      user.mid,
      user.userId,
      dto,
    );
    return this.toResponse(snippet);
  }

  @Get()
  async findAll(@CurrentUser() user: UserSession) {
    const items = await this.snippetsService.findAll(
      user.tenantId,
      user.mid,
      user.userId,
    );
    return items.map((item) => this.toListItemResponse(item));
  }

  @Patch(':id')
  @UseGuards(CsrfGuard)
  @Audited('snippet.updated', { targetIdParam: 'id' })
  async update(
    @CurrentUser() user: UserSession,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(UpdateSnippetSchema)) dto: UpdateSnippetDto,
  ) {
    const snippet = await this.snippetsService.update(
      user.tenantId,
      user.mid,
      user.userId,
      id,
      dto,
    );
    return this.toResponse(snippet);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  @Audited('snippet.deleted', { targetIdParam: 'id' })
  async delete(
    @CurrentUser() user: UserSession,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.snippetsService.delete(user.tenantId, user.mid, user.userId, id);
    return { success: true };
  }

  private toResponse(snippet: Snippet) {
    return {
      id: snippet.id,
      title: snippet.title,
      triggerPrefix: snippet.triggerPrefix,
      code: snippet.code,
      description: snippet.description ?? null,
      scope: snippet.scope,
      createdByUserName: null,
      updatedByUserName: null,
      createdAt: snippet.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: snippet.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  private toListItemResponse(item: SnippetListItem) {
    return {
      id: item.id,
      title: item.title,
      triggerPrefix: item.triggerPrefix,
      code: item.code,
      description: item.description ?? null,
      scope: item.scope,
      createdByUserName: item.createdByUserName ?? null,
      updatedByUserName: item.updatedByUserName ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
