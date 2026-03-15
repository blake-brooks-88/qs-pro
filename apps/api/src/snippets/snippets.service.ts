import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AppError, ErrorCode, RlsContextService } from '@qpp/backend-shared';
import type { CreateSnippetDto, UpdateSnippetDto } from '@qpp/shared-types';

import { FeaturesService } from '../features/features.service';
import type {
  Snippet,
  SnippetListItem,
  SnippetsRepository,
} from './snippets.repository';

@Injectable()
export class SnippetsService {
  constructor(
    @Inject('SNIPPETS_REPOSITORY')
    private readonly snippetsRepository: SnippetsRepository,
    private readonly featuresService: FeaturesService,
    private readonly rlsContext: RlsContextService,
  ) {}

  async create(
    tenantId: string,
    mid: string,
    userId: string,
    dto: CreateSnippetDto,
  ): Promise<Snippet> {
    return this.rlsContext.runWithIsolatedUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        await this.assertFeatureEnabled(tenantId);
        return this.snippetsRepository.create({
          tenantId,
          mid,
          userId,
          title: dto.title,
          triggerPrefix: dto.triggerPrefix,
          code: dto.code,
          description: dto.description ?? null,
          scope: dto.scope ?? 'bu',
        });
      },
    );
  }

  async findAll(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<SnippetListItem[]> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        await this.assertFeatureEnabled(tenantId);
        return this.snippetsRepository.findAll();
      },
    );
  }

  async findById(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
  ): Promise<Snippet> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        await this.assertFeatureEnabled(tenantId);
        const snippet = await this.snippetsRepository.findById(id);
        if (!snippet) {
          throw new NotFoundException(`Snippet not found: ${id}`);
        }
        return snippet;
      },
    );
  }

  async update(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
    dto: UpdateSnippetDto,
  ): Promise<Snippet> {
    return this.rlsContext.runWithIsolatedUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        await this.assertFeatureEnabled(tenantId);
        const existing = await this.snippetsRepository.findById(id);
        if (!existing) {
          throw new NotFoundException(`Snippet not found: ${id}`);
        }
        const updated = await this.snippetsRepository.update(id, {
          title: dto.title,
          triggerPrefix: dto.triggerPrefix,
          code: dto.code,
          description: dto.description,
          scope: dto.scope,
          updatedByUserId: userId,
        });
        if (!updated) {
          throw new NotFoundException(`Snippet not found: ${id}`);
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
        await this.assertFeatureEnabled(tenantId);
        const deleted = await this.snippetsRepository.delete(id);
        if (!deleted) {
          throw new NotFoundException(`Snippet not found: ${id}`);
        }
      },
    );
  }

  private async assertFeatureEnabled(tenantId: string): Promise<void> {
    const { features } = await this.featuresService.getTenantFeatures(tenantId);
    if (!features.teamSnippets) {
      throw new AppError(ErrorCode.FEATURE_NOT_ENABLED, undefined, {
        operation: 'snippets',
        reason: 'Snippet library requires a Pro subscription',
      });
    }
  }
}
