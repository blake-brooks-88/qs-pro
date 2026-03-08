import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, inArray } from '@qpp/database';
import type {
  PostgresJsDatabase,
  StripeSubscriptionStatus,
} from '@qpp/database';
import {
  encrypt,
  orgSubscriptions,
  stripeBillingBindings,
  tenants,
} from '@qpp/database';
import type Stripe from 'stripe';

import { BackofficeAuditService } from '../audit/audit.service.js';
import { DRIZZLE_DB } from '../database/database.module.js';
import { StripeCatalogService } from '../stripe/stripe-catalog.service.js';
import { STRIPE_CLIENT } from '../stripe/stripe.provider.js';
import {
  PAYMENT_TERMS_DAYS,
  type CreateInvoicedSubscriptionDto,
  type InvoiceListItemDto,
  type InvoicedSubscriptionResultDto,
  type PaginatedInvoiceList,
} from './invoicing.types.js';

@Injectable()
export class InvoicingService {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    @Inject(DRIZZLE_DB) private readonly db: PostgresJsDatabase,
    private readonly auditService: BackofficeAuditService,
    private readonly catalogService: StripeCatalogService,
  ) {}

  async createInvoicedSubscription(
    params: CreateInvoicedSubscriptionDto,
    backofficeUserId: string,
    ipAddress: string,
  ): Promise<InvoicedSubscriptionResultDto> {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.eid, params.tenantEid))
      .limit(1);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with EID ${params.tenantEid} not found`,
      );
    }

    const encryptionKey = process.env.ENCRYPTION_KEY!;
    const encryptedEid = encrypt(tenant.eid, encryptionKey);

    const [existingBinding] = await this.db
      .select()
      .from(stripeBillingBindings)
      .where(eq(stripeBillingBindings.tenantId, tenant.id))
      .limit(1);

    let customerId: string;

    if (existingBinding?.stripeCustomerId) {
      customerId = existingBinding.stripeCustomerId;
    } else {
      const customer = await this.stripe.customers.create({
        email: params.customerEmail,
        name: params.customerName,
        metadata: {
          company: params.companyName,
          eid: encryptedEid,
        },
      });
      customerId = customer.id;
    }

    const priceId = await this.catalogService.resolveCheckoutPriceId(
      params.tier,
      params.interval,
    );

    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: priceId, quantity: params.seatCount }],
      collection_method: 'send_invoice',
      days_until_due: PAYMENT_TERMS_DAYS[params.paymentTerms],
      metadata: {
        eid: encryptedEid,
        tier: params.tier,
      },
    };

    if (params.couponId) {
      subscriptionParams.discounts = [{ coupon: params.couponId }];
    }

    const subscription =
      await this.stripe.subscriptions.create(subscriptionParams);

    await this.db
      .insert(stripeBillingBindings)
      .values({
        tenantId: tenant.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
      })
      .onConflictDoUpdate({
        target: stripeBillingBindings.tenantId,
        set: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          updatedAt: new Date(),
        },
      });

    await this.db
      .insert(orgSubscriptions)
      .values({
        tenantId: tenant.id,
        tier: params.tier,
        stripeSubscriptionStatus:
          subscription.status as StripeSubscriptionStatus,
        seatLimit: params.seatCount,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
      })
      .onConflictDoUpdate({
        target: orgSubscriptions.tenantId,
        set: {
          tier: params.tier,
          stripeSubscriptionStatus:
          subscription.status as StripeSubscriptionStatus,
          seatLimit: params.seatCount,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          updatedAt: new Date(),
        },
      });

    const invoices = await this.stripe.invoices.list({
      subscription: subscription.id,
      limit: 1,
    });

    const firstInvoice = invoices.data[0];

    await this.auditService.log({
      backofficeUserId,
      targetTenantId: tenant.id,
      eventType: 'backoffice.subscription_created',
      metadata: {
        tier: params.tier,
        interval: params.interval,
        seatCount: params.seatCount,
        paymentTerms: params.paymentTerms,
        customerEmail: params.customerEmail,
        subscriptionId: subscription.id,
      },
      ipAddress,
    });

    return {
      invoiceUrl: firstInvoice?.hosted_invoice_url ?? null,
      subscriptionId: subscription.id,
      invoiceStatus: firstInvoice?.status ?? 'pending',
      amount: firstInvoice?.amount_due ?? 0,
      dueDate: firstInvoice?.due_date
        ? new Date(firstInvoice.due_date * 1000).toISOString()
        : null,
      stripeInvoiceId: firstInvoice?.id ?? null,
    };
  }

  async listInvoicesForTenant(
    tenantId: string,
  ): Promise<InvoiceListItemDto[]> {
    const [binding] = await this.db
      .select()
      .from(stripeBillingBindings)
      .where(eq(stripeBillingBindings.tenantId, tenantId))
      .limit(1);

    if (!binding?.stripeCustomerId) {
      return [];
    }

    const invoices = await this.stripe.invoices.list({
      customer: binding.stripeCustomerId,
      limit: 50,
    });

    return invoices.data.map((inv) => ({
      tenantEid: null,
      tenantName: null,
      amount: inv.amount_due,
      status: inv.status ?? 'unknown',
      date: inv.created
        ? new Date(inv.created * 1000).toISOString()
        : null,
      dueDate: inv.due_date
        ? new Date(inv.due_date * 1000).toISOString()
        : null,
      hostedUrl: inv.hosted_invoice_url ?? null,
    }));
  }

  async listAllInvoices(options: {
    limit?: number;
    startingAfter?: string;
  }): Promise<PaginatedInvoiceList> {
    const limit = Math.min(options.limit ?? 25, 100);

    const listParams: Stripe.InvoiceListParams = { limit };
    if (options.startingAfter) {
      listParams.starting_after = options.startingAfter;
    }

    const invoices = await this.stripe.invoices.list(listParams);

    const customerIds = [
      ...new Set(
        invoices.data
          .map((inv) =>
            typeof inv.customer === 'string' ? inv.customer : null,
          )
          .filter((id): id is string => id !== null),
      ),
    ];

    const tenantMap = new Map<string, { eid: string }>();

    if (customerIds.length > 0) {
      const bindings = await this.db
        .select({
          stripeCustomerId: stripeBillingBindings.stripeCustomerId,
          eid: tenants.eid,
        })
        .from(stripeBillingBindings)
        .innerJoin(tenants, eq(stripeBillingBindings.tenantId, tenants.id))
        .where(
          inArray(stripeBillingBindings.stripeCustomerId, customerIds),
        );

      for (const b of bindings) {
        if (b.stripeCustomerId) {
          tenantMap.set(b.stripeCustomerId, { eid: b.eid });
        }
      }
    }

    const items: InvoiceListItemDto[] = invoices.data.map((inv) => {
      const custId =
        typeof inv.customer === 'string' ? inv.customer : null;
      const tenantInfo = custId ? tenantMap.get(custId) : undefined;

      return {
        tenantEid: tenantInfo?.eid ?? null,
        tenantName: inv.customer_name ?? null,
        amount: inv.amount_due,
        status: inv.status ?? 'unknown',
        date: inv.created
          ? new Date(inv.created * 1000).toISOString()
          : null,
        dueDate: inv.due_date
          ? new Date(inv.due_date * 1000).toISOString()
          : null,
        hostedUrl: inv.hosted_invoice_url ?? null,
      };
    });

    const lastInvoice = invoices.data[invoices.data.length - 1];

    return {
      invoices: items,
      hasMore: invoices.has_more,
      nextCursor: invoices.has_more ? (lastInvoice?.id ?? null) : null,
    };
  }
}
