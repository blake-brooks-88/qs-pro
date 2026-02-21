import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

export const StripeProvider = {
  provide: STRIPE_CLIENT,
  useFactory: (configService: ConfigService): Stripe | null => {
    const secretKey = configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      return null;
    }
    return new Stripe(secretKey);
  },
  inject: [ConfigService],
};
