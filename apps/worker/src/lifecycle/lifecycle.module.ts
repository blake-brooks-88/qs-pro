import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "@qpp/backend-shared";
import Stripe from "stripe";

import { LifecycleCleanupService } from "./lifecycle-cleanup.service";

const StripeProvider = {
  provide: "STRIPE_CLIENT",
  useFactory: (configService: ConfigService): Stripe | null => {
    const nodeEnv = configService.get<string>("NODE_ENV");
    const secretKey = configService.get<string>("STRIPE_SECRET_KEY");
    if (!secretKey) {
      if (nodeEnv === "production") {
        throw new Error("STRIPE_SECRET_KEY must be set in production");
      }
      return null;
    }
    const apiVersion = configService.get<string>("STRIPE_API_VERSION");
    if (!apiVersion) {
      throw new Error(
        "STRIPE_API_VERSION must be set when STRIPE_SECRET_KEY is configured",
      );
    }
    return new Stripe(secretKey, {
      apiVersion: apiVersion as Stripe.StripeConfig["apiVersion"],
    });
  },
  inject: [ConfigService],
};

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule],
  providers: [StripeProvider, LifecycleCleanupService],
})
export class LifecycleModule {}
