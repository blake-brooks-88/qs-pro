import * as crypto from 'node:crypto';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { MetadataService, SessionGuard } from '@qpp/backend-shared';
import type { CreateDataExtensionDto } from '@qpp/shared-types';
import { CreateDataExtensionSchema } from '@qpp/shared-types';

import { CsrfGuard } from '../auth/csrf.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('metadata')
@UseGuards(SessionGuard)
@UseFilters(GlobalExceptionFilter)
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get('folders')
  async getFolders(
    @CurrentUser() user: UserSession,
    @Query('eid') eid?: string,
    @Query('contentType') contentType?: string,
  ) {
    const allowedContentTypes = ['dataextension', 'queryactivity'];
    if (contentType && !allowedContentTypes.includes(contentType)) {
      throw new BadRequestException(
        `Invalid contentType. Allowed values: ${allowedContentTypes.join(', ')}`,
      );
    }

    return this.metadataService.getFolders(
      user.tenantId,
      user.userId,
      user.mid,
      eid,
      contentType,
    );
  }

  @Get('data-extensions')
  async getDataExtensions(
    @CurrentUser() user: UserSession,
    @Query('eid') eid: string,
  ) {
    return this.metadataService.getDataExtensions(
      user.tenantId,
      user.userId,
      user.mid,
      eid,
    );
  }

  @Get('fields')
  async getFields(
    @CurrentUser() user: UserSession,
    @Query('key') key: string,
    @Query('eid') eid?: string,
  ) {
    if (typeof key !== 'string' || !key.trim()) {
      throw new BadRequestException('key is required');
    }
    return this.metadataService.getFields(
      user.tenantId,
      user.userId,
      user.mid,
      key,
      eid,
    );
  }

  @Post('data-extensions')
  @UseGuards(CsrfGuard)
  async createDataExtension(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(CreateDataExtensionSchema))
    dto: CreateDataExtensionDto,
  ) {
    const {
      folderId,
      subscriberKeyField,
      fields,
      retention,
      customerKey,
      ...rest
    } = dto;

    const categoryId = Number.parseInt(folderId, 10);

    const finalCustomerKey =
      customerKey?.trim() || crypto.randomUUID().toUpperCase();

    let sendableFieldType: string | undefined;
    if (subscriberKeyField) {
      const field = fields.find((f) => f.name === subscriberKeyField);
      sendableFieldType = field?.type;
    }

    const response = await this.metadataService.createDataExtension(
      user.tenantId,
      user.userId,
      user.mid,
      {
        ...rest,
        customerKey: finalCustomerKey,
        categoryId,
        sendableField: subscriberKeyField,
        sendableFieldType,
        retention,
        fields: fields.map((f) => ({
          name: f.name,
          fieldType: f.type,
          maxLength: f.length,
          scale: f.scale,
          precision: f.precision,
          isPrimaryKey: f.isPrimaryKey,
          isRequired: !f.isNullable,
          defaultValue: f.defaultValue,
        })),
      },
    );

    return { ...response, customerKey: finalCustomerKey };
  }
}
