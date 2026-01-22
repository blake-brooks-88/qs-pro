import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AppError,
  buildQppResultsDataExtensionName,
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
  type FieldDefinition,
  type MetadataFetcher,
} from "../query-analyzer";
import { buildQueryCustomerKey } from "../query-definition.utils";
import { type ColumnDefinition, inferSchema } from "../schema-inferrer";
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

function safeRecordGet<V>(
  record: Record<string, V> | undefined,
  key: string,
): V | undefined {
  // eslint-disable-next-line security/detect-object-injection
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

@Injectable()
export class RunToTempFlow implements IFlowStrategy {
  private readonly logger = new Logger(RunToTempFlow.name);

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
    const { runId, tenantId, userId, mid, sqlText, snippetName } = job;
    const deName = buildQppResultsDataExtensionName(runId, snippetName);

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
    }

    const inferredSchema = await inferSchema(expandedSql, metadataFetcher);
    this.logger.debug(
      `Inferred schema for run (fields: ${inferredSchema.length})`,
    );

    await publishStatus?.("creating_data_extension");
    const folderId = await this.ensureQppFolder(tenantId, userId, mid);

    const deObjectId = await this.createTempDe(
      job,
      deName,
      folderId,
      inferredSchema,
    );

    const queryCustomerKey = buildQueryCustomerKey(runId);
    const queryIds = await this.createQueryDefinition(
      job,
      queryCustomerKey,
      expandedSql,
      deObjectId,
      deName,
      folderId,
    );

    await publishStatus?.("executing_query");
    const taskId = await this.performQuery(job, queryIds.objectId);

    return {
      status: "ready",
      taskId,
      queryDefinitionId: queryIds.definitionId,
      queryCustomerKey,
      targetDeName: deName,
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

  private async createTempDe(
    job: ShellQueryJob,
    deName: string,
    folderId: number,
    schema: ColumnDefinition[],
  ): Promise<string> {
    const { tenantId, userId, mid } = job;

    if (schema.length === 0) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
        statusMessage: "Empty schema array",
      });
    }

    await this.deleteDataExtensionIfExists(job, deName);

    const result = await this.dataExtensionService.create(
      tenantId,
      userId,
      mid,
      {
        name: deName,
        customerKey: deName,
        categoryId: folderId,
        fields: schema.map((col, index) => ({
          name: col.Name,
          fieldType: this.mapFieldType(col.FieldType),
          maxLength: this.isTextType(col.FieldType) ? col.MaxLength : undefined,
          scale: col.FieldType === "Decimal" ? col.Scale : undefined,
          precision: col.FieldType === "Decimal" ? col.Precision : undefined,
          isPrimaryKey: index === 0 ? false : undefined,
        })),
      },
    );

    this.logger.log(
      `Data Extension created: ${deName} (ObjectID: ${result.objectId})`,
    );
    return result.objectId;
  }

  private mapFieldType(fieldType: string): string {
    const mapping = {
      Text: "Text",
      Number: "Number",
      Decimal: "Decimal",
      Date: "Date",
      Boolean: "Boolean",
      EmailAddress: "EmailAddress",
      Phone: "Phone",
      Email: "EmailAddress",
    } as const satisfies Record<string, string>;
    return mapping[fieldType as keyof typeof mapping] ?? "Text";
  }

  private isTextType(fieldType: string): boolean {
    return ["Text", "EmailAddress", "Phone"].includes(fieldType);
  }

  private async deleteDataExtensionIfExists(
    job: ShellQueryJob,
    deName: string,
  ): Promise<void> {
    const { tenantId, userId, mid } = job;

    try {
      await this.dataExtensionService.delete(tenantId, userId, mid, deName);
      this.logger.debug(`Deleted existing Data Extension: ${deName}`);
    } catch (error) {
      this.logger.debug(
        `Delete DE failed for ${deName} (may not exist): ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private async createQueryDefinition(
    job: ShellQueryJob,
    key: string,
    sql: string,
    deObjectId: string,
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
        targetCustomerKey: deName,
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
}
