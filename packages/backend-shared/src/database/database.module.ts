import { Global, Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDatabaseFromClient, createSqlClient } from "@qpp/database";

import { createDbProxy } from "./db-proxy";
import { RlsContextService } from "./rls-context.service";

type SqlClient = ReturnType<typeof createSqlClient>;
type Database = ReturnType<typeof createDatabaseFromClient>;

@Global()
@Module({
  providers: [
    {
      provide: "SQL_CLIENT",
      useFactory: (configService: ConfigService) => {
        const logger = new Logger("DatabaseModule");
        const dbUrl =
          configService.get<string>("DATABASE_URL") ||
          "postgres://postgres:password@127.0.0.1:5432/qs_pro";

        logger.log(
          `Connecting to database at ${dbUrl.replace(/:[^:]+@/, ":****@")}`,
        );
        return createSqlClient(dbUrl);
      },
      inject: [ConfigService],
    },
    {
      provide: "DATABASE",
      useFactory: (sql: SqlClient) => {
        const defaultDb: Database = createDatabaseFromClient(sql);
        return createDbProxy(defaultDb);
      },
      inject: ["SQL_CLIENT"],
    },
    RlsContextService,
  ],
  exports: ["DATABASE", "SQL_CLIENT", RlsContextService],
})
export class DatabaseModule {}
