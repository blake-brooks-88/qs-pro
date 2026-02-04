import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AppError,
  type DataExtensionField,
  DataExtensionService,
  DataFolderService,
  ErrorCode,
  QueryDefinitionService,
  RlsContextService,
} from "@qpp/backend-shared";
import {
  and,
  eq,
  type PostgresJsDatabase,
  tenantSettings,
} from "@qpp/database";

import { MceQueryValidator } from "../mce-query-validator";
import {
  containsSelectStar,
  expandSelectStar,
  extractTableNames,
  type FieldDefinition,
  type MetadataFetcher,
} from "../query-analyzer";
import { buildQueryCustomerKey } from "../query-definition.utils";
import { inferSchema } from "../schema-inferrer";
import {
  FlowResult,
  IFlowStrategy,
  ShellQueryJob,
  StatusPublisher,
} from "../shell-query.types";

interface QueryDefinitionIds {
  objectId: string;
  definitionId: string;
}

function normalizeTableName(name: string): string {
  if (name.startsWith("[") && name.endsWith("]")) {
    return name.slice(1, -1);
  }
  return name;
}

function normalizeMceIdentifier(name: string): string {
  const trimmed = name.trim();
  const noBrackets = normalizeTableName(trimmed);
  const noEntPrefix = noBrackets.toLowerCase().startsWith("ent.")
    ? noBrackets.slice(4)
    : noBrackets;
  return noEntPrefix.trim().toLowerCase();
}

function safeRecordGet<V>(
  record: Record<string, V> | undefined,
  key: string,
): V | undefined {
  // eslint-disable-next-line security/detect-object-injection
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

@Injectable()
export class RunToTargetFlow implements IFlowStrategy {
  private readonly logger = new Logger(RunToTargetFlow.name);

  constructor(
    private readonly queryValidator: MceQueryValidator,
    private readonly rlsContext: RlsContextService,
    @Inject("DATABASE")
    private readonly db: PostgresJsDatabase<Record<string, never>>,
    private readonly dataExtensionService: DataExtensionService,
    private readonly dataFolderService: DataFolderService,
    private readonly queryDefinitionService: QueryDefinitionService,
  ) {}

  async execute(
    job: ShellQueryJob,
    publishStatus?: StatusPublisher,
  ): Promise<FlowResult> {
    const { tenantId, userId, mid, sqlText, targetDeCustomerKey } = job;

    if (!targetDeCustomerKey) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
        statusMessage: "targetDeCustomerKey is required for RunToTargetFlow",
      });
    }

    await publishStatus?.("validating_query");
    const validationResult = await this.queryValidator.validateQuery(sqlText, {
      tenantId,
      userId,
      mid,
    });

    if (!validationResult.valid) {
      throw new AppError(
        ErrorCode.MCE_VALIDATION_FAILED,
        undefined,
        undefined,
        { violations: validationResult.errors },
      );
    }

    const metadataFetcher = this.createMetadataFetcher(job);
    let expandedSql = sqlText;

    if (containsSelectStar(sqlText)) {
      expandedSql = await expandSelectStar(sqlText, metadataFetcher);
      this.logger.debug(
        `Expanded SELECT * query (length=${expandedSql.length})`,
      );

      // We validate the original sqlText above, but we actually execute expandedSql.
      // Re-validate to avoid running an invalid/unsupported expansion in MCE.
      const expandedValidation = await this.queryValidator.validateQuery(
        expandedSql,
        { tenantId, userId, mid },
      );

      if (!expandedValidation.valid) {
        throw new AppError(
          ErrorCode.MCE_VALIDATION_FAILED,
          undefined,
          undefined,
          { violations: expandedValidation.errors },
        );
      }
    }

    await publishStatus?.("targeting_data_extension");
    const targetDe = await this.dataExtensionService.retrieveByCustomerKey(
      tenantId,
      userId,
      mid,
      targetDeCustomerKey,
    );

    if (!targetDe) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        statusMessage: `Target Data Extension not found: ${targetDeCustomerKey}`,
      });
    }

    this.logger.log(
      `Found target Data Extension: ${targetDe.name} (CustomerKey: ${targetDe.customerKey}, ObjectID: ${targetDe.objectId})`,
    );

    // Safety guard: MCE "Overwrite" clears the target DE before the query runs.
    // If the query reads from the same DE, it will end up selecting 0 rows and
    // permanently wipe the DE contents.
    const referencedTables = extractTableNames(expandedSql);
    const normalizedTargetNames = new Set([
      normalizeMceIdentifier(targetDe.customerKey),
      normalizeMceIdentifier(targetDe.name),
    ]);
    const readsFromTarget = referencedTables.some((table) =>
      normalizedTargetNames.has(normalizeMceIdentifier(table)),
    );

    if (readsFromTarget) {
      throw new AppError(ErrorCode.MCE_BAD_REQUEST, undefined, {
        statusMessage:
          `Cannot overwrite Data Extension "${targetDe.name}" because it is referenced in the query FROM/JOIN. ` +
          "Overwrite clears the target before the query runs, resulting in 0 rows. " +
          "Choose a different target, or write to a temp DE first and then overwrite the target from that temp DE.",
      });
    }

    await this.validateTargetSchemaCompatibility(
      job,
      expandedSql,
      metadataFetcher,
      targetDe.name,
    );

    const folderId = await this.ensureQppFolder(tenantId, userId, mid);

    const queryCustomerKey = buildQueryCustomerKey(userId);
    const queryIds = await this.createQueryDefinition(
      job,
      queryCustomerKey,
      expandedSql,
      targetDe.objectId,
      targetDe.customerKey,
      targetDe.name,
      folderId,
    );

    await publishStatus?.("executing_query");
    const taskId = await this.performQuery(job, queryIds.objectId);

    return {
      status: "ready",
      taskId,
      queryDefinitionId: queryIds.definitionId,
      queryCustomerKey,
      targetDeCustomerKey: targetDe.customerKey,
    };
  }

  async retrieveQueryDefinitionObjectId(
    tenantId: string,
    userId: string,
    mid: string,
    customerKey: string,
  ): Promise<string | null> {
    try {
      const queryDef = await this.queryDefinitionService.retrieve(
        tenantId,
        userId,
        mid,
        customerKey,
      );

      if (queryDef?.objectId) {
        this.logger.log(
          `Retrieved QueryDefinition ObjectID ${queryDef.objectId} for CustomerKey ${customerKey}`,
        );
        return queryDef.objectId;
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve QueryDefinition ObjectID by CustomerKey ${customerKey}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return null;
    }
  }

  private createMetadataFetcher(job: ShellQueryJob): MetadataFetcher {
    return {
      getFieldsForTable: async (
        tableName: string,
      ): Promise<FieldDefinition[] | null> => {
        const normalizedName = normalizeTableName(tableName);
        const provided =
          safeRecordGet(job.tableMetadata, tableName) ??
          safeRecordGet(job.tableMetadata, normalizedName);

        if (provided && provided.length > 0) {
          this.logger.debug(`Using provided metadata for ${tableName}`);
          return provided;
        }

        this.logger.debug(`Fetching metadata from MCE for ${tableName}`);
        return this.fetchMetadataFromMce(job, tableName);
      },
    };
  }

  private async fetchMetadataFromMce(
    job: ShellQueryJob,
    tableName: string,
  ): Promise<FieldDefinition[] | null> {
    const { tenantId, userId, mid } = job;

    try {
      const fields = await this.dataExtensionService.retrieveFields(
        tenantId,
        userId,
        mid,
        tableName,
      );

      if (fields.length === 0) {
        return null;
      }

      return fields.map(
        (f: DataExtensionField): FieldDefinition => ({
          Name: f.name,
          FieldType: f.fieldType,
          MaxLength: f.maxLength ?? 254,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch metadata for table ${tableName}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return null;
    }
  }

  private async ensureQppFolder(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<number> {
    return this.rlsContext.runWithTenantContext(tenantId, mid, async () => {
      const settings = await this.db
        .select()
        .from(tenantSettings)
        .where(
          and(
            eq(tenantSettings.tenantId, tenantId),
            eq(tenantSettings.mid, mid),
          ),
        );

      if (settings[0]?.qppFolderId) {
        return settings[0].qppFolderId;
      }

      let folderId: number;

      const existingFolders = await this.dataFolderService.retrieve(
        tenantId,
        userId,
        mid,
        { name: "QueryPlusPlus Results" },
      );

      const existingFolder = existingFolders[0];
      if (existingFolder) {
        folderId = existingFolder.id;
      } else {
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

        const parentFolderId = rootFolder.id;

        const createResult = await this.dataFolderService.create(
          tenantId,
          userId,
          mid,
          {
            name: "QueryPlusPlus Results",
            parentFolderId,
            contentType: "dataextension",
          },
        );

        folderId = createResult.id;
      }

      await this.db
        .insert(tenantSettings)
        .values({
          tenantId,
          mid,
          qppFolderId: folderId,
        })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.mid],
          set: { qppFolderId: folderId },
        });

      return folderId;
    });
  }

  private async createQueryDefinition(
    job: ShellQueryJob,
    key: string,
    sql: string,
    deObjectId: string,
    deCustomerKey: string,
    deName: string,
    folderId: number,
  ): Promise<QueryDefinitionIds> {
    const { tenantId, userId, mid } = job;

    await this.deleteQueryDefinitionIfExists(job, key);

    const result = await this.queryDefinitionService.create(
      tenantId,
      userId,
      mid,
      {
        name: key,
        customerKey: key,
        categoryId: folderId,
        targetId: deObjectId,
        targetCustomerKey: deCustomerKey,
        targetName: deName,
        queryText: sql,
      },
    );

    this.logger.log(
      `QueryDefinition created: ${key} (ObjectID: ${result.objectId})`,
    );

    return {
      objectId: result.objectId,
      definitionId: result.objectId,
    };
  }

  private async deleteQueryDefinitionIfExists(
    job: ShellQueryJob,
    key: string,
  ): Promise<void> {
    const { tenantId, userId, mid } = job;

    try {
      const queryDef = await this.queryDefinitionService.retrieve(
        tenantId,
        userId,
        mid,
        key,
      );

      if (!queryDef?.objectId) {
        this.logger.debug(
          `QueryDefinition ${key} not found, nothing to delete`,
        );
        return;
      }

      await this.queryDefinitionService.delete(
        tenantId,
        userId,
        mid,
        queryDef.objectId,
      );
      this.logger.debug(
        `Deleted QueryDefinition ${key} (ObjectID: ${queryDef.objectId})`,
      );
    } catch (error) {
      this.logger.debug(
        `Delete QueryDefinition failed for ${key}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private async performQuery(
    job: ShellQueryJob,
    queryObjectId: string,
  ): Promise<string> {
    const { tenantId, userId, mid } = job;

    const result = await this.queryDefinitionService.perform(
      tenantId,
      userId,
      mid,
      queryObjectId,
    );

    this.logger.log(`Query started with TaskID: ${result.taskId}`);
    return result.taskId;
  }

  private async validateTargetSchemaCompatibility(
    job: ShellQueryJob,
    sqlText: string,
    metadataFetcher: MetadataFetcher,
    targetDeName: string,
  ): Promise<void> {
    const { tenantId, userId, mid } = job;

    let inferredColumns: Array<{
      name: string;
      fieldType: string;
      maxLength?: number;
    }>;

    try {
      const schema = await inferSchema(sqlText, metadataFetcher);
      inferredColumns = schema.map((col) => ({
        name: col.Name,
        fieldType: col.FieldType,
        maxLength: col.MaxLength,
      }));
    } catch (error) {
      this.logger.debug(
        `Target schema validation skipped (schema inference failed): ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return;
    }

    if (inferredColumns.length === 0) {
      this.logger.debug(
        "Target schema validation skipped (empty inferred schema)",
      );
      return;
    }

    const targetFields = await this.dataExtensionService.retrieveFields(
      tenantId,
      userId,
      mid,
      targetDeName,
    );

    if (targetFields.length === 0) {
      this.logger.debug(
        `Target schema validation skipped (no target fields returned for "${targetDeName}")`,
      );
      return;
    }

    const targetByName = new Map(
      targetFields.map((f) => [normalizeMceIdentifier(f.name), f] as const),
    );

    const violations: string[] = [];

    const seen = new Set<string>();
    for (const col of inferredColumns) {
      const normalized = normalizeMceIdentifier(col.name);
      if (seen.has(normalized)) {
        violations.push(`Duplicate output column: "${col.name}".`);
      }
      seen.add(normalized);
    }

    for (const col of inferredColumns) {
      const targetField = targetByName.get(normalizeMceIdentifier(col.name));
      if (!targetField) {
        violations.push(`Target DE missing field "${col.name}".`);
        continue;
      }
    }

    const requiredMissing = targetFields
      .filter((f) => f.isRequired)
      .filter((f) => !seen.has(normalizeMceIdentifier(f.name)));
    for (const field of requiredMissing) {
      violations.push(`Required target field "${field.name}" is not selected.`);
    }

    if (violations.length > 0) {
      throw new AppError(
        ErrorCode.MCE_VALIDATION_FAILED,
        undefined,
        undefined,
        {
          violations: [
            `Query output does not match target Data Extension "${targetDeName}".`,
            ...violations,
          ],
        },
      );
    }
  }
}
