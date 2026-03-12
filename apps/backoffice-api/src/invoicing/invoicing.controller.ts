import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { CurrentUser } from "../auth/current-user.decorator.js";
import { Roles } from "../auth/roles.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { InvoicingService } from "./invoicing.service.js";
import {
  type CreateInvoicedSubscriptionDto,
  CreateInvoicedSubscriptionSchema,
  type ListInvoicesQuery,
  ListInvoicesQuerySchema,
} from "./invoicing.types.js";

@Controller("invoicing")
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Post("subscriptions")
  @Roles("editor")
  async createSubscription(
    @Body(new ZodValidationPipe(CreateInvoicedSubscriptionSchema))
    body: CreateInvoicedSubscriptionDto,
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const ip = req.ip;
    return this.invoicingService.createInvoicedSubscription(body, user.id, ip);
  }

  @Get("tenants/:tenantId/invoices")
  @Roles("viewer")
  async listTenantInvoices(@Param("tenantId") tenantId: string) {
    return this.invoicingService.listInvoicesForTenant(tenantId);
  }

  @Get("invoices")
  @Roles("viewer")
  async listAllInvoices(
    @Query(new ZodValidationPipe(ListInvoicesQuerySchema))
    query: ListInvoicesQuery,
  ) {
    return this.invoicingService.listAllInvoices({
      limit: query.limit,
      startingAfter: query.startingAfter,
    });
  }
}
