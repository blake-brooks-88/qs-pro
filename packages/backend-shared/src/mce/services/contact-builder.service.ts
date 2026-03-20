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

interface ContactBuilderEdge {
  sourceDE: string;
  sourceColumn: string;
  targetDE: string;
  targetColumn: string;
}

interface MceAttrSetDefAttribute {
  id: string;
  storageName?: string;
  name?: { value: string };
  key: string;
}

interface MceRelationshipAttribute {
  leftAttributeID: string;
  rightAttributeID: string;
}

interface MceRelationship {
  leftItem: { identifier: string };
  rightItem: { identifier: string };
  relationshipAttributes?: MceRelationshipAttribute[];
}

interface MceAttrSetDef {
  id: string;
  fullyQualifiedName: string;
  storageLogicalType?: string;
  relationships?: MceRelationship[];
  attributes?: MceAttrSetDefAttribute[];
}

interface MceAttrSetDefResponse {
  page: number;
  pageSize: number;
  count: number;
  items: MceAttrSetDef[];
}

export type {
  AttributeGroup,
  AttributeGroupResponse,
  AttributeSet,
  AttributeSetDefinition,
  AttributeSetLink,
  ContactBuilderEdge,
};

@Injectable()
export class ContactBuilderService {
  private readonly logger = new Logger(ContactBuilderService.name);

  constructor(private readonly mceBridge: MceBridgeService) {}

  async getRelationshipEdges(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<ContactBuilderEdge[]> {
    try {
      const response = await this.mceBridge.request<MceAttrSetDefResponse>(
        tenantId,
        userId,
        mid,
        { method: "GET", url: "/contacts/v1/attributeSetDefinitions" },
        MCE_TIMEOUTS.METADATA,
      );

      if (!response || !Array.isArray(response.items)) {
        this.logger.warn(
          `Unexpected attributeSetDefinitions response for BU ${mid}`,
        );
        return [];
      }

      return this.extractEdgesFromAttrSetDefs(response.items);
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

  private extractEdgesFromAttrSetDefs(
    setDefs: MceAttrSetDef[],
  ): ContactBuilderEdge[] {
    const setMap = new Map<
      string,
      { name: string; attrs: Map<string, string> }
    >();

    for (const setDef of setDefs) {
      const attrs = new Map<string, string>();
      for (const attr of setDef.attributes ?? []) {
        const attrName = attr.storageName ?? attr.name?.value ?? attr.key;
        attrs.set(attr.id, attrName);
      }
      setMap.set(setDef.id, { name: setDef.fullyQualifiedName, attrs });
    }

    const edges: ContactBuilderEdge[] = [];
    const seen = new Set<string>();

    for (const setDef of setDefs) {
      for (const rel of setDef.relationships ?? []) {
        const leftSet = setMap.get(rel.leftItem.identifier);
        const rightSet = setMap.get(rel.rightItem.identifier);
        if (!leftSet || !rightSet) {
          continue;
        }

        for (const ra of rel.relationshipAttributes ?? []) {
          const leftAttr = leftSet.attrs.get(ra.leftAttributeID);
          const rightAttr = rightSet.attrs.get(ra.rightAttributeID);
          if (!leftAttr || !rightAttr) {
            continue;
          }

          const forwardKey = `${leftSet.name}|${leftAttr}|${rightSet.name}|${rightAttr}`;
          const reverseKey = `${rightSet.name}|${rightAttr}|${leftSet.name}|${leftAttr}`;

          if (seen.has(forwardKey) || seen.has(reverseKey)) {
            continue;
          }
          seen.add(forwardKey);

          edges.push({
            sourceDE: leftSet.name,
            sourceColumn: leftAttr,
            targetDE: rightSet.name,
            targetColumn: rightAttr,
          });
        }
      }
    }

    return edges;
  }
}
