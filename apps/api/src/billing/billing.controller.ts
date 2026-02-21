import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { AppError, ErrorCode } from '@qpp/backend-shared';
import type { FastifyRequest } from 'fastify';
import type Stripe from 'stripe';

import { STRIPE_CLIENT } from './stripe.provider';
import { WebhookHandlerService } from './webhook-handler.service';

@Controller('billing')
@SkipThrottle()
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly configService: ConfigService,
    private readonly webhookHandler: WebhookHandlerService,
  ) {}

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
    } catch {
      this.logger.warn('Stripe webhook signature verification failed');
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED, undefined, {
        reason: 'Invalid webhook signature',
      });
    }

    await this.webhookHandler.process(event);
    return { received: true };
  }
}
