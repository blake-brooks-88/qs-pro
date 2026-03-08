import { Global, Module } from '@nestjs/common';

import { StripeCatalogService } from './stripe-catalog.service.js';
import { StripeProvider } from './stripe.provider.js';

@Global()
@Module({
  providers: [StripeProvider, StripeCatalogService],
  exports: [StripeProvider, StripeCatalogService],
})
export class StripeModule {}
