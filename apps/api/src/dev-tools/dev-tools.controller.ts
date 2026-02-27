import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';
import { z } from 'zod';

import { CsrfGuard } from '../auth/csrf.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DevGuard } from '../common/guards/dev.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DevToolsService } from './dev-tools.service';

const SetTrialBodySchema = z.object({
  days: z.number().int().min(0).max(365).nullable(),
});

const CheckoutBodySchema = z.object({
  tier: z.enum(['pro', 'enterprise']),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
});

const SubscriptionStateBodySchema = z.object({
  tier: z.enum(['free', 'pro', 'enterprise']),
  stripeCustomerId: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  stripeSubscriptionId: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  currentPeriodEnds: z
    .string()
    .datetime()
    .nullish()
    .transform((v) => (v ? new Date(v) : null)),
  trialEndsAt: z
    .string()
    .datetime()
    .nullish()
    .transform((v) => (v ? new Date(v) : null)),
  seatLimit: z
    .number()
    .int()
    .nullish()
    .transform((v) => v ?? null),
});

const SimulateWebhookBodySchema = z.object({
  eventType: z.string(),
  data: z.record(z.unknown()),
  eventId: z.string().optional(),
});

@Controller('dev-tools')
@UseGuards(SessionGuard, DevGuard)
export class DevToolsController {
  constructor(private readonly devToolsService: DevToolsService) {}

  @Post('trial')
  @UseGuards(CsrfGuard)
  async setTrial(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(SetTrialBodySchema))
    body: z.infer<typeof SetTrialBodySchema>,
  ) {
    return this.devToolsService.setTrialDays(user.tenantId, body.days);
  }

  @Post('checkout')
  @UseGuards(CsrfGuard)
  async createCheckout(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(CheckoutBodySchema))
    body: z.infer<typeof CheckoutBodySchema>,
  ) {
    return this.devToolsService.createCheckout(
      user.tenantId,
      body.tier,
      body.interval,
    );
  }

  @Post('cancel')
  @UseGuards(CsrfGuard)
  async cancelSubscription(@CurrentUser() user: UserSession) {
    return this.devToolsService.cancelSubscription(user.tenantId);
  }

  @Post('reset')
  @UseGuards(CsrfGuard)
  async resetToFree(@CurrentUser() user: UserSession) {
    return this.devToolsService.resetToFree(user.tenantId);
  }

  @Post('subscription-state')
  @UseGuards(CsrfGuard)
  async setSubscriptionState(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(SubscriptionStateBodySchema))
    body: z.infer<typeof SubscriptionStateBodySchema>,
  ) {
    return this.devToolsService.setSubscriptionState(user.tenantId, body);
  }

  @Post('simulate-webhook')
  @UseGuards(CsrfGuard)
  async simulateWebhook(
    @CurrentUser() _user: UserSession,
    @Body(new ZodValidationPipe(SimulateWebhookBodySchema))
    body: z.infer<typeof SimulateWebhookBodySchema>,
  ) {
    return this.devToolsService.simulateWebhook(
      body.eventType,
      body.data,
      body.eventId,
    );
  }
}
