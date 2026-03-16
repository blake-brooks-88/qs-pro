import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AppError,
  type AttributeGroup,
  type ConfigRule,
  ContactBuilderService,
  ErrorCode,
  RelationshipConfigService,
} from '@qpp/backend-shared';
import * as cacheManager from 'cache-manager';
import { randomUUID } from 'crypto';

interface RelationshipEdge {
  sourceDE: string;
  sourceColumn: string;
  targetDE: string;
  targetColumn: string;
  confidence: 'confirmed' | 'high' | 'medium' | 'low';
  source: 'attribute_group' | 'user' | 'inferred';
  ruleId?: string;
}

interface ExclusionRule {
  sourceDE: string;
  sourceColumn: string;
  targetDE: string;
  targetColumn: string;
}

interface RelationshipGraph {
  edges: RelationshipEdge[];
  exclusions: ExclusionRule[];
}

interface SaveRuleParams {
  ruleType: 'alias_group' | 'explicit_link' | 'exclusion';
  sourceDE: string;
  sourceColumn: string;
  targetDE: string;
  targetColumn: string;
  folderId: string;
}

export type {
  ExclusionRule,
  RelationshipEdge,
  RelationshipGraph,
  SaveRuleParams,
};

const CACHE_TTL_MS = 600_000;

@Injectable()
export class RelationshipsService {
  private readonly logger = new Logger(RelationshipsService.name);

  constructor(
    private readonly contactBuilder: ContactBuilderService,
    private readonly configService: RelationshipConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: cacheManager.Cache,
  ) {}

  async getGraph(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<RelationshipGraph> {
    const cacheKey = `relationships:graph:${tenantId}:${mid}`;

    const cached = await this.cache.get<RelationshipGraph>(cacheKey);
    if (cached) {
      return cached;
    }

    const [attributeGroups, configRules] = await Promise.all([
      this.contactBuilder.getAttributeGroups(tenantId, userId, mid),
      this.configService.getRules(tenantId, userId, mid),
    ]);

    const attrEdges = this.attributeGroupsToEdges(attributeGroups);
    const { userEdges, exclusions } = this.configRulesToEdges(configRules);

    const graph: RelationshipGraph = {
      edges: [...attrEdges, ...userEdges],
      exclusions,
    };

    await this.cache.set(cacheKey, graph, CACHE_TTL_MS);

    return graph;
  }

  async saveRule(
    tenantId: string,
    userId: string,
    mid: string,
    params: SaveRuleParams,
  ): Promise<ConfigRule> {
    const ruleId = randomUUID();
    const payload = JSON.stringify({
      sourceDE: params.sourceDE,
      sourceColumn: params.sourceColumn,
      targetDE: params.targetDE,
      targetColumn: params.targetColumn,
    });

    try {
      await this.configService.ensureConfigDE(
        tenantId,
        userId,
        mid,
        params.folderId,
      );
    } catch (error) {
      if (error instanceof AppError) {
        throw new AppError(ErrorCode.CONFIG_DE_CREATION_FAILED, error, {
          operation: 'ensureConfigDE',
          tenantId,
          mid,
        });
      }
      throw error;
    }

    const rule: ConfigRule = {
      RuleID: ruleId,
      RuleType: params.ruleType,
      Payload: payload,
    };

    await this.configService.upsertRule(tenantId, userId, mid, rule);

    const cacheKey = `relationships:graph:${tenantId}:${mid}`;
    await this.cache.del(cacheKey);

    this.logger.log(`Relationship rule saved: ${ruleId} for ${mid}`);

    return rule;
  }

  async deleteRule(
    tenantId: string,
    userId: string,
    mid: string,
    ruleId: string,
  ): Promise<void> {
    await this.configService.deleteRule(tenantId, userId, mid, ruleId);

    const cacheKey = `relationships:graph:${tenantId}:${mid}`;
    await this.cache.del(cacheKey);

    this.logger.log(`Relationship rule deleted: ${ruleId} for ${mid}`);
  }

  async dismissRelationship(
    tenantId: string,
    userId: string,
    mid: string,
    params: Omit<SaveRuleParams, 'ruleType'>,
  ): Promise<ConfigRule> {
    return this.saveRule(tenantId, userId, mid, {
      ...params,
      ruleType: 'exclusion',
    });
  }

  private attributeGroupsToEdges(groups: AttributeGroup[]): RelationshipEdge[] {
    const edges: RelationshipEdge[] = [];

    for (const group of groups) {
      if (!group.attributeSets) {
        continue;
      }
      for (const attrSet of group.attributeSets) {
        if (!attrSet.links || !attrSet.dataExtensionName) {
          continue;
        }
        for (const link of attrSet.links) {
          edges.push({
            sourceDE: attrSet.dataExtensionName,
            sourceColumn: link.field,
            targetDE: group.name,
            targetColumn: link.relatedField,
            confidence: 'confirmed',
            source: 'attribute_group',
          });
        }
      }
    }

    return edges;
  }

  private configRulesToEdges(rules: ConfigRule[]): {
    userEdges: RelationshipEdge[];
    exclusions: ExclusionRule[];
  } {
    const userEdges: RelationshipEdge[] = [];
    const exclusions: ExclusionRule[] = [];

    for (const rule of rules) {
      let parsed: {
        sourceDE: string;
        sourceColumn: string;
        targetDE: string;
        targetColumn: string;
      };
      try {
        parsed = JSON.parse(rule.Payload) as typeof parsed;
      } catch {
        this.logger.warn(`Invalid payload for rule ${rule.RuleID}`);
        continue;
      }

      if (rule.RuleType === 'exclusion') {
        exclusions.push({
          sourceDE: parsed.sourceDE,
          sourceColumn: parsed.sourceColumn,
          targetDE: parsed.targetDE,
          targetColumn: parsed.targetColumn,
        });
      } else {
        userEdges.push({
          sourceDE: parsed.sourceDE,
          sourceColumn: parsed.sourceColumn,
          targetDE: parsed.targetDE,
          targetColumn: parsed.targetColumn,
          confidence: 'confirmed',
          source: 'user',
          ruleId: rule.RuleID,
        });
      }
    }

    return { userEdges, exclusions };
  }
}
