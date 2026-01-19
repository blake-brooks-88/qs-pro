import { Module } from "@nestjs/common";
import {
  DrizzleCredentialsRepository,
  DrizzleTenantRepository,
  DrizzleUserRepository,
} from "@qs-pro/database";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { DatabaseModule } from "../database/database.module";
import { AuthService } from "./auth.service";
import { SeatLimitService } from "./seat-limit.service";

@Module({
  imports: [DatabaseModule],
  providers: [
    AuthService,
    SeatLimitService,
    {
      provide: "TENANT_REPOSITORY",
      useFactory: (db: PostgresJsDatabase) => new DrizzleTenantRepository(db),
      inject: ["DATABASE"],
    },
    {
      provide: "USER_REPOSITORY",
      useFactory: (db: PostgresJsDatabase) => new DrizzleUserRepository(db),
      inject: ["DATABASE"],
    },
    {
      provide: "CREDENTIALS_REPOSITORY",
      useFactory: (db: PostgresJsDatabase) =>
        new DrizzleCredentialsRepository(db),
      inject: ["DATABASE"],
    },
  ],
  exports: [AuthService, SeatLimitService],
})
export class AuthModule {}
