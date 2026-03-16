import { Injectable, Logger } from "@nestjs/common";

import { AppError, ErrorCode } from "../../common/errors";
import { MCE_TIMEOUTS } from "../http-timeout.config";
import { MceBridgeService } from "../mce-bridge.service";

interface AttributeSetLink {
  field: string;
  relatedField: string;
}

interface AttributeSet {
  id: string;
  name: string;
  dataExtensionName?: string;
  links?: AttributeSetLink[];
}

interface AttributeGroup {
  id: string;
  name: string;
  attributeSets?: AttributeSet[];
}

interface AttributeGroupResponse {
  count: number;
  items: AttributeGroup[];
}

interface AttributeSetDefinition {
  id: string;
  name: string;
  fields?: Array<{
    name: string;
    dataType: string;
    isPrimaryKey?: boolean;
  }>;
}

export type {
  AttributeGroup,
  AttributeGroupResponse,
  AttributeSet,
  AttributeSetDefinition,
  AttributeSetLink,
};

@Injectable()
export class ContactBuilderService {
  private readonly logger = new Logger(ContactBuilderService.name);

  constructor(private readonly mceBridge: MceBridgeService) {}

  async getAttributeGroups(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<AttributeGroup[]> {
    try {
      const response = await this.mceBridge.request<AttributeGroupResponse>(
        tenantId,
        userId,
        mid,
        { method: "GET", url: "/contacts/v1/attributeGroups" },
        MCE_TIMEOUTS.METADATA,
      );

      if (!response || !Array.isArray(response.items)) {
        this.logger.warn(
          `Unexpected Contact Builder response shape for BU ${mid}`,
        );
        return [];
      }

      return response.items;
    } catch (error) {
      if (error instanceof AppError) {
        if (
          error.code === ErrorCode.MCE_FORBIDDEN ||
          error.code === ErrorCode.MCE_BAD_REQUEST
        ) {
          this.logger.warn(
            `Contact Builder not available for BU ${mid}: ${error.code}`,
          );
          return [];
        }
      }
      throw error;
    }
  }

  async getAttributeSetDefinition(
    tenantId: string,
    userId: string,
    mid: string,
    setId: string,
  ): Promise<AttributeSetDefinition | null> {
    try {
      const response = await this.mceBridge.request<AttributeSetDefinition>(
        tenantId,
        userId,
        mid,
        {
          method: "GET",
          url: `/contacts/v1/attributeSetDefinitions/${setId}`,
        },
        MCE_TIMEOUTS.METADATA,
      );

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        if (
          error.code === ErrorCode.MCE_FORBIDDEN ||
          error.code === ErrorCode.MCE_BAD_REQUEST
        ) {
          this.logger.warn(
            `Attribute set definition not available for BU ${mid}, set ${setId}: ${error.code}`,
          );
          return null;
        }
      }
      throw error;
    }
  }
}
