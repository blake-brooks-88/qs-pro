import { InjectQueue } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { AppError, ErrorCode, SessionGuard } from '@qpp/backend-shared';
import { Queue } from 'bullmq';
import type { FastifyRequest } from 'fastify';
import type Stripe from 'stripe';
import { z } from 'zod';

import { CsrfGuard } from '../auth/csrf.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BILLING_WEBHOOK_JOB, BILLING_WEBHOOK_QUEUE } from './billing.queue';
import type {
  CheckoutConfirmationResponse,
  PricesResponse,
} from './billing.service';
import { BillingService } from './billing.service';
import { STRIPE_CLIENT } from './stripe.provider';

const CheckoutBodySchema = z.object({
  tier: z.enum(['pro', 'enterprise']),
  interval: z.enum(['monthly', 'annual']),
});

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    @InjectQueue(BILLING_WEBHOOK_QUEUE)
    private readonly billingWebhookQueue: Queue,
    private readonly configService: ConfigService,
    private readonly billingService: BillingService,
  ) {}

  @Get('prices')
  async getPrices(): Promise<PricesResponse> {
    return this.billingService.getPrices();
  }

  @Post('checkout')
  @UseGuards(SessionGuard, CsrfGuard)
  async createCheckout(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(CheckoutBodySchema))
    body: z.infer<typeof CheckoutBodySchema>,
  ): Promise<{ url: string }> {
    return this.billingService.createCheckoutSession(
      user.tenantId,
      body.tier,
      body.interval,
    );
  }

  @Post('portal')
  @UseGuards(SessionGuard, CsrfGuard)
  async createPortal(
    @CurrentUser() user: UserSession,
  ): Promise<{ url: string }> {
    return this.billingService.createPortalSession(user.tenantId);
  }

  @Get('checkout-session/:sessionId')
  @UseGuards(SessionGuard)
  async confirmCheckoutSession(
    @CurrentUser() user: UserSession,
    @Param('sessionId') sessionId: string,
  ): Promise<CheckoutConfirmationResponse> {
    return this.billingService.confirmCheckoutSession(user.tenantId, sessionId);
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

    await this.billingWebhookQueue.add(
      BILLING_WEBHOOK_JOB,
      { event },
      {
        jobId: event.id,
        attempts: 8,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
    return { received: true };
  }
}
