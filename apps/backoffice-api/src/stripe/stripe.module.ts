import { Global, Module } from "@nestjs/common";

import { StripeProvider } from "./stripe.provider.js";
import { StripeCatalogService } from "./stripe-catalog.service.js";

@Global()
@Module({
  providers: [StripeProvider, StripeCatalogService],
  exports: [StripeProvider, StripeCatalogService],
})
export class StripeModule {}
