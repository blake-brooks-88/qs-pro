import { Injectable, Logger } from "@nestjs/common";

import { AppError, ErrorCode } from "../../common/errors";
import { MCE_TIMEOUTS } from "../http-timeout.config";
import { MceBridgeService } from "../mce-bridge.service";
import { DataExtensionService } from "./data-extension.service";
import { DataFolderService } from "./data-folder.service";

const CONFIG_DE_KEY = "QPP_RelationshipConfig";
const CONFIG_DE_NAME = "QPP_RelationshipConfig";

type RuleType = "alias_group" | "explicit_link" | "exclusion";

interface ConfigRule {
  RuleID: string;
  RuleType: RuleType;
  Payload: string;
}

interface RowsetResponse {
  items?: Array<Record<string, unknown>>;
}

export { CONFIG_DE_KEY, CONFIG_DE_NAME };
export type { ConfigRule, RuleType };

@Injectable()
export class RelationshipConfigService {
  private readonly logger = new Logger(RelationshipConfigService.name);

  constructor(
    private readonly mceBridge: MceBridgeService,
    private readonly dataExtensionService: DataExtensionService,
    private readonly dataFolderService: DataFolderService,
  ) {}

  async ensureConfigDE(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<void> {
    const existing = await this.dataExtensionService.retrieveByCustomerKey(
      tenantId,
      userId,
      mid,
      CONFIG_DE_KEY,
    );

    if (existing) {
      return;
    }

    const categoryId = await this.ensureConfigFolder(tenantId, userId, mid);
    this.logger.log(
      `Creating config DE for BU ${mid}, categoryId=${categoryId}`,
    );

    await this.dataExtensionService.create(tenantId, userId, mid, {
      name: CONFIG_DE_NAME,
      customerKey: CONFIG_DE_KEY,
      categoryId,
      fields: [
        {
          name: "RuleID",
          fieldType: "Text",
          maxLength: 50,
          isPrimaryKey: true,
          isRequired: true,
        },
        {
          name: "RuleType",
          fieldType: "Text",
          maxLength: 50,
          isRequired: true,
        },
        {
          name: "Payload",
          fieldType: "Text",
          maxLength: 4000,
          isRequired: true,
        },
      ],
    });
    this.logger.log(`Config DE created for BU ${mid}`);
  }

  private async ensureConfigFolder(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<number> {
    const qppFolders = await this.dataFolderService.retrieve(
      tenantId,
      userId,
      mid,
      { name: "QueryPlusPlus Results", contentType: "dataextension" },
    );

    if (qppFolders[0]) {
      return qppFolders[0].id;
    }

    const rootFolders = await this.dataFolderService.retrieve(
      tenantId,
      userId,
      mid,
      { name: "Data Extensions", contentType: "dataextension" },
    );

    const rootFolder = rootFolders[0];
    if (!rootFolder) {
      throw new AppError(ErrorCode.MCE_BAD_REQUEST, undefined, {
        statusMessage: "Root DE folder not found",
      });
    }

    const created = await this.dataFolderService.create(tenantId, userId, mid, {
      name: "QueryPlusPlus Results",
      parentFolderId: rootFolder.id,
      contentType: "dataextension",
    });
    return created.id;
  }

  async getRules(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<ConfigRule[]> {
    try {
      const response = await this.mceBridge.request<RowsetResponse>(
        tenantId,
        userId,
        mid,
        {
          method: "GET",
          url: `/data/v1/customobjectdata/key/${CONFIG_DE_KEY}/rowset`,
        },
        MCE_TIMEOUTS.DATA_RETRIEVAL,
      );

      if (!response || !Array.isArray(response.items)) {
        return [];
      }

      return response.items.map((item) => {
        const keys = (item.keys ?? {}) as Record<string, unknown>;
        const values = (item.values ?? {}) as Record<string, unknown>;

        return {
          RuleID: String(keys.ruleid ?? keys.RuleID ?? ""),
          RuleType: String(
            values.ruletype ?? values.RuleType ?? "",
          ) as RuleType,
          Payload: String(values.payload ?? values.Payload ?? ""),
        };
      });
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.code === ErrorCode.RESOURCE_NOT_FOUND ||
          error.code === ErrorCode.MCE_BAD_REQUEST)
      ) {
        return [];
      }
      throw error;
    }
  }

  async upsertRule(
    tenantId: string,
    userId: string,
    mid: string,
    rule: ConfigRule,
  ): Promise<void> {
    await this.mceBridge.request(
      tenantId,
      userId,
      mid,
      {
        method: "POST",
        url: `/hub/v1/dataevents/key:${CONFIG_DE_KEY}/rowset`,
        data: [
          {
            keys: { RuleID: rule.RuleID },
            values: { RuleType: rule.RuleType, Payload: rule.Payload },
          },
        ],
      },
      MCE_TIMEOUTS.METADATA,
    );
  }

  async deleteRule(
    tenantId: string,
    userId: string,
    mid: string,
    ruleId: string,
  ): Promise<void> {
    await this.mceBridge.request(
      tenantId,
      userId,
      mid,
      {
        method: "DELETE",
        url: `/hub/v1/dataevents/key:${CONFIG_DE_KEY}/rows/RuleID:${ruleId}`,
      },
      MCE_TIMEOUTS.METADATA,
    );
  }
}
