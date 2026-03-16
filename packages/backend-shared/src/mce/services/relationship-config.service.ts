import { Injectable, Logger } from "@nestjs/common";

import { AppError, ErrorCode } from "../../common/errors";
import { MCE_TIMEOUTS } from "../http-timeout.config";
import { MceBridgeService } from "../mce-bridge.service";
import { DataExtensionService } from "./data-extension.service";

const CONFIG_DE_KEY = "_QPP_RelationshipConfig";
const CONFIG_DE_NAME = "_QPP_RelationshipConfig";

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
  ) {}

  async ensureConfigDE(
    tenantId: string,
    userId: string,
    mid: string,
    folderId: string,
  ): Promise<void> {
    try {
      await this.dataExtensionService.create(tenantId, userId, mid, {
        name: CONFIG_DE_NAME,
        customerKey: CONFIG_DE_KEY,
        categoryId: parseInt(folderId, 10),
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
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === ErrorCode.MCE_SOAP_FAILURE &&
        typeof error.context?.statusMessage === "string" &&
        error.context.statusMessage.includes("already exists")
      ) {
        this.logger.log(`Config DE already exists for BU ${mid}`);
        return;
      }
      throw error;
    }
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

      return response.items.map((item) => ({
        RuleID: String(item.RuleID ?? ""),
        RuleType: String(item.RuleType ?? "") as RuleType,
        Payload: String(item.Payload ?? ""),
      }));
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
        url: `/data/v1/customobjectdata/key/${CONFIG_DE_KEY}/rows`,
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
        url: `/data/v1/customobjectdata/key/${CONFIG_DE_KEY}/rows`,
        data: { keys: [{ RuleID: ruleId }] },
      },
      MCE_TIMEOUTS.METADATA,
    );
  }
}
