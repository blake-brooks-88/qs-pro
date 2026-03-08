import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UsePipes,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { InvoicingService } from './invoicing.service.js';
import {
  CreateInvoicedSubscriptionSchema,
  type CreateInvoicedSubscriptionDto,
} from './invoicing.types.js';

@Controller('api/invoicing')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Post('subscriptions')
  @Roles('editor')
  @UsePipes(new ZodValidationPipe(CreateInvoicedSubscriptionSchema))
  async createSubscription(
    @Body() body: CreateInvoicedSubscriptionDto,
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const ip = req.ip;
    return this.invoicingService.createInvoicedSubscription(
      body,
      user.id,
      ip,
    );
  }

  @Get('tenants/:tenantId/invoices')
  @Roles('viewer')
  async listTenantInvoices(@Param('tenantId') tenantId: string) {
    return this.invoicingService.listInvoicesForTenant(tenantId);
  }

  @Get('invoices')
  @Roles('viewer')
  async listAllInvoices(
    @Query('limit') limit?: string,
    @Query('startingAfter') startingAfter?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.invoicingService.listAllInvoices({
      limit:
        parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined,
      startingAfter,
    });
  }
}
