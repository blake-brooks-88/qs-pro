import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import {
  AppError,
  EncryptionService,
  ErrorCode,
  SessionGuard,
} from '@qpp/backend-shared';
import type { ITenantRepository } from '@qpp/database';
import type { FastifyRequest } from 'fastify';
import type Stripe from 'stripe';

import { STRIPE_CLIENT } from './stripe.provider';
import { WebhookHandlerService } from './webhook-handler.service';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly configService: ConfigService,
    private readonly webhookHandler: WebhookHandlerService,
    private readonly encryptionService: EncryptionService,
    @Inject('TENANT_REPOSITORY')
    private readonly tenantRepo: ITenantRepository,
  ) {}

  @Get('pricing-token')
  @UseGuards(SessionGuard)
  async getPricingToken(
    @Req() req: FastifyRequest,
  ): Promise<{ token: string }> {
    const session = req.session;
    const tenantId = session?.get('tenantId') as string | undefined;
    if (!tenantId) {
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED, undefined, {
        reason: 'No active session',
      });
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        reason: 'Tenant not found',
      });
    }

    const token = this.encryptionService.encrypt(tenant.eid);
    if (!token) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
        reason: 'Failed to generate pricing token',
      });
    }

    return { token };
  }

  @SkipThrottle()
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: FastifyRequest & { rawBody?: string },
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe not configured');
    }

    if (!req.rawBody) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
        reason: 'Raw body not available for webhook verification',
      });
    }

    if (!signature) {
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED, undefined, {
        reason: 'Missing stripe-signature header',
      });
    }

    const webhookSecret = this.configService.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    this.logger.debug(
      `Webhook received — signature present: ${!!signature}, rawBody length: ${req.rawBody.length}`,
    );

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      this.logger.warn(
        `[DIAG] Signature verification FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED, undefined, {
        reason: 'Invalid webhook signature',
      });
    }

    this.logger.debug(
      `Webhook verified — event.type: ${event.type}, event.id: ${event.id}`,
    );

    await this.webhookHandler.process(event);
    this.logger.debug(`Webhook processed successfully — ${event.type}`);
    return { received: true };
  }
}
