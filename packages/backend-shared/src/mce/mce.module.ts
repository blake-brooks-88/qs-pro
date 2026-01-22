import { CacheModule } from "@nestjs/cache-manager";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AuthService } from "../auth/auth.service";
import { MCE_AUTH_PROVIDER } from "./mce-auth.provider";
import { MceBridgeService } from "./mce-bridge.service";
import { MceHttpClient } from "./mce-http-client";
import { MetadataService } from "./metadata.service";
import { AsyncStatusService } from "./services/async-status.service";
import { DataExtensionService } from "./services/data-extension.service";
import { DataFolderService } from "./services/data-folder.service";
import { QueryDefinitionService } from "./services/query-definition.service";
import { RestDataService } from "./services/rest-data.service";

@Module({
  imports: [AuthModule, CacheModule.register()],
  providers: [
    MceHttpClient,
    MceBridgeService,
    MetadataService,
    DataExtensionService,
    DataFolderService,
    QueryDefinitionService,
    AsyncStatusService,
    RestDataService,
    {
      provide: MCE_AUTH_PROVIDER,
      useExisting: AuthService,
    },
  ],
  exports: [
    MceBridgeService,
    MetadataService,
    DataExtensionService,
    DataFolderService,
    QueryDefinitionService,
    AsyncStatusService,
    RestDataService,
  ],
})
export class MceModule {}
