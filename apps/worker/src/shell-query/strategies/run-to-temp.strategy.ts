import { Inject, Injectable, Logger } from "@nestjs/common";
import { MceBridgeService, RlsContextService } from "@qs-pro/backend-shared";
import { and, eq, tenantSettings } from "@qs-pro/database";

import { MceQueryValidator } from "../mce-query-validator";
import {
  containsSelectStar,
  expandSelectStar,
  type FieldDefinition,
  type MetadataFetcher,
} from "../query-analyzer";
import { type ColumnDefinition, inferSchema } from "../schema-inferrer";
import {
  FlowResult,
  IFlowStrategy,
  ShellQueryJob,
  SoapCreateResponse,
  SoapPerformResponse,
  SoapRetrieveResponse,
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
    private readonly mceBridge: MceBridgeService,
    private readonly queryValidator: MceQueryValidator,
    // TODO: Wrap DB operations with rlsContext.runWithTenantContext for RLS consistency
    // @ts-expect-error Intentionally kept for future RLS implementation
    private readonly rlsContext: RlsContextService,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject("DATABASE") private readonly db: any,
  ) {}

  async execute(
    job: ShellQueryJob,
    publishStatus?: StatusPublisher,
  ): Promise<FlowResult> {
    const { runId, tenantId, userId, mid, sqlText, snippetName } = job;
    const hash = runId.substring(0, 8);
    const deName = snippetName
      ? `QPP_${snippetName.replace(/\s+/g, "_")}_${hash}`
      : `QPP_Results_${hash}`;

    await publishStatus?.("validating_query");
    const validationResult = await this.queryValidator.validateQuery(sqlText, {
      tenantId,
      userId,
      mid,
    });

    if (!validationResult.valid) {
      const errorMessage =
        validationResult.errors?.join("; ") ?? "Query validation failed";
      throw new MceValidationError(errorMessage);
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
    this.logger.log(
      `Inferred schema: ${JSON.stringify(inferredSchema.map((c) => ({ name: c.Name, type: c.FieldType })))}`,
    );

    await publishStatus?.("creating_data_extension");
    const folderId = await this.ensureQppFolder(tenantId, userId, mid);

    const deObjectId = await this.createTempDe(
      job,
      deName,
      folderId,
      inferredSchema,
    );

    const queryCustomerKey = `QPP_Query_${runId}`;
    const queryIds = await this.createQueryDefinition(
      job,
      queryCustomerKey,
      expandedSql,
      deName,
      deObjectId,
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
    const soap = `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            <ObjectType>QueryDefinition</ObjectType>
            <Properties>ID</Properties>
            <Properties>ObjectID</Properties>
            <Properties>CustomerKey</Properties>
            <Filter xsi:type="SimpleFilterPart">
               <Property>CustomerKey</Property>
               <SimpleOperator>equals</SimpleOperator>
               <Value>${this.escapeXml(customerKey)}</Value>
            </Filter>
         </RetrieveRequest>
      </RetrieveRequestMsg>`;

    try {
      const response = await this.mceBridge.soapRequest<SoapRetrieveResponse>(
        tenantId,
        userId,
        mid,
        soap,
        "Retrieve",
      );

      const results = response.Body?.RetrieveResponseMsg?.Results;
      if (!results) {
        return null;
      }

      const queryDef = Array.isArray(results) ? results[0] : results;
      const objectId = queryDef?.ObjectID;

      if (objectId) {
        this.logger.log(
          `Retrieved QueryDefinition ObjectID ${objectId} for CustomerKey ${customerKey}`,
        );
        return objectId;
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve QueryDefinition ObjectID by CustomerKey ${customerKey}: ${(error as Error).message}`,
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
      const soap = `
        <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
           <RetrieveRequest>
              <ObjectType>DataExtensionField</ObjectType>
              <Properties>Name</Properties>
              <Properties>FieldType</Properties>
              <Properties>MaxLength</Properties>
              <Filter xsi:type="ComplexFilterPart">
                 <LeftOperand xsi:type="SimpleFilterPart">
                    <Property>DataExtension.Name</Property>
                    <SimpleOperator>equals</SimpleOperator>
                    <Value>${this.escapeXml(tableName)}</Value>
                 </LeftOperand>
                 <LogicalOperator>OR</LogicalOperator>
                 <RightOperand xsi:type="SimpleFilterPart">
                    <Property>DataExtension.CustomerKey</Property>
                    <SimpleOperator>equals</SimpleOperator>
                    <Value>${this.escapeXml(tableName)}</Value>
                 </RightOperand>
              </Filter>
           </RetrieveRequest>
        </RetrieveRequestMsg>`;

      const response = await this.mceBridge.soapRequest<SoapRetrieveResponse>(
        tenantId,
        userId,
        mid,
        soap,
        "Retrieve",
      );

      const results = response.Body?.RetrieveResponseMsg?.Results;
      if (!results) {
        return null;
      }

      const fieldResults = Array.isArray(results) ? results : [results];
      return fieldResults.map(
        (f): FieldDefinition => ({
          Name: String(f.Name ?? ""),
          FieldType: String(f.FieldType ?? "Text"),
          MaxLength: f.MaxLength ? parseInt(String(f.MaxLength), 10) : 254,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch metadata for table ${tableName}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private async ensureQppFolder(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<number> {
    const settings = await this.db
      .select()
      .from(tenantSettings)
      .where(
        and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.mid, mid)),
      );

    if (settings[0]?.qppFolderId) {
      return settings[0].qppFolderId;
    }

    const searchSoap = `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            <ObjectType>DataFolder</ObjectType>
            <Properties>ID</Properties>
            <Properties>Name</Properties>
            <Filter xsi:type="SimpleFilterPart">
               <Property>Name</Property>
               <SimpleOperator>equals</SimpleOperator>
               <Value>QueryPlusPlus Results</Value>
            </Filter>
         </RetrieveRequest>
      </RetrieveRequestMsg>`;

    const searchResponse =
      await this.mceBridge.soapRequest<SoapRetrieveResponse>(
        tenantId,
        userId,
        mid,
        searchSoap,
        "Retrieve",
      );
    const results = searchResponse.Body?.RetrieveResponseMsg?.Results;

    let folderId: number;

    if (results && (Array.isArray(results) ? results.length > 0 : true)) {
      const folder = Array.isArray(results) ? results[0] : results;
      if (!folder?.ID) {
        throw new Error("Folder ID not found in retrieve response");
      }
      folderId = parseInt(folder.ID, 10);
    } else {
      const rootFolderSoap = `
        <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
           <RetrieveRequest>
              <ObjectType>DataFolder</ObjectType>
              <Properties>ID</Properties>
              <Properties>Name</Properties>
              <Filter xsi:type="ComplexFilterPart">
                 <LeftOperand xsi:type="SimpleFilterPart">
                    <Property>Name</Property>
                    <SimpleOperator>equals</SimpleOperator>
                    <Value>Data Extensions</Value>
                 </LeftOperand>
                 <LogicalOperator>AND</LogicalOperator>
                 <RightOperand xsi:type="SimpleFilterPart">
                    <Property>ContentType</Property>
                    <SimpleOperator>equals</SimpleOperator>
                    <Value>dataextension</Value>
                 </RightOperand>
              </Filter>
           </RetrieveRequest>
        </RetrieveRequestMsg>`;

      const rootFolderResponse =
        await this.mceBridge.soapRequest<SoapRetrieveResponse>(
          tenantId,
          userId,
          mid,
          rootFolderSoap,
          "Retrieve",
        );
      const rootResults = rootFolderResponse.Body?.RetrieveResponseMsg?.Results;
      const rootFolder = Array.isArray(rootResults)
        ? rootResults[0]
        : rootResults;

      if (!rootFolder?.ID) {
        throw new Error(
          "Could not find root Data Extensions folder. Please ensure the folder exists in Marketing Cloud.",
        );
      }

      const parentFolderId = parseInt(rootFolder.ID, 10);

      const createSoap = `
        <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
           <Objects xsi:type="DataFolder">
              <Name>QueryPlusPlus Results</Name>
              <CustomerKey>QueryPlusPlus_Results_${mid}</CustomerKey>
              <Description>Temporary storage for Query++ results</Description>
              <ContentType>dataextension</ContentType>
              <ParentFolder>
                 <ID>${parentFolderId}</ID>
              </ParentFolder>
           </Objects>
        </CreateRequest>`;

      const createResponse =
        await this.mceBridge.soapRequest<SoapCreateResponse>(
          tenantId,
          userId,
          mid,
          createSoap,
          "Create",
        );
      const createResult = createResponse.Body?.CreateResponse?.Results;
      if (!createResult || createResult.StatusCode !== "OK") {
        throw new Error(
          `Failed to create results folder: ${createResult?.StatusMessage ?? "Unknown error"}`,
        );
      }
      if (!createResult.NewID) {
        throw new Error("NewID not returned from folder creation");
      }
      folderId = parseInt(createResult.NewID, 10);
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
  }

  private async createTempDe(
    job: ShellQueryJob,
    deName: string,
    folderId: number,
    schema: ColumnDefinition[],
  ): Promise<string> {
    const { tenantId, userId, mid } = job;

    await this.deleteDataExtensionIfExists(job, deName);

    const fieldsXml = this.buildFieldsXml(schema);

    const soap = `
      <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <Objects xsi:type="DataExtension">
            <Name>${this.escapeXml(deName)}</Name>
            <CustomerKey>${this.escapeXml(deName)}</CustomerKey>
            <CategoryID>${folderId}</CategoryID>
            <IsSendable>false</IsSendable>
            <DataRetentionPeriodLength>1</DataRetentionPeriodLength>
            <DataRetentionPeriod>Days</DataRetentionPeriod>
            <RowBasedRetention>false</RowBasedRetention>
            <ResetRetentionPeriodOnImport>false</ResetRetentionPeriodOnImport>
            <DeleteAtEndOfRetentionPeriod>true</DeleteAtEndOfRetentionPeriod>
            <Fields>
               ${fieldsXml}
            </Fields>
         </Objects>
      </CreateRequest>`;

    const response = await this.mceBridge.soapRequest<SoapCreateResponse>(
      tenantId,
      userId,
      mid,
      soap,
      "Create",
    );

    this.logger.debug(
      `Create DE response for ${deName}: ${JSON.stringify(response)}`,
    );

    const result = response.Body?.CreateResponse?.Results;
    if (result && result.StatusCode !== "OK") {
      this.logger.error(
        `Create DE failed - Full response: ${JSON.stringify(response, null, 2)}`,
      );
      throw new Error(
        `Failed to create Data Extension: ${result.StatusMessage}`,
      );
    }

    const objectId = result?.NewObjectID;
    if (!objectId || typeof objectId !== "string") {
      throw new Error("Data Extension created but no ObjectID returned");
    }

    this.logger.log(
      `Data Extension created: ${deName} (ObjectID: ${objectId})`,
    );
    return objectId;
  }

  private async deleteDataExtensionIfExists(
    job: ShellQueryJob,
    deName: string,
  ): Promise<void> {
    const { tenantId, userId, mid } = job;

    const soap = `
      <DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <Objects xsi:type="DataExtension">
            <CustomerKey>${this.escapeXml(deName)}</CustomerKey>
         </Objects>
      </DeleteRequest>`;

    try {
      const response = await this.mceBridge.soapRequest(
        tenantId,
        userId,
        mid,
        soap,
        "Delete",
      );
      this.logger.debug(
        `Delete DE response for ${deName}: ${JSON.stringify(response)}`,
      );
    } catch (error) {
      this.logger.debug(
        `Delete DE failed for ${deName} (may not exist): ${(error as Error).message}`,
      );
    }
  }

  private buildFieldsXml(schema: ColumnDefinition[]): string {
    if (schema.length === 0) {
      throw new Error(
        "Internal error: schema inference returned empty array. This should not happen.",
      );
    }

    return schema
      .map((col, index) => {
        const escapedName = this.escapeXml(col.Name);
        const isPrimaryKey = index === 0;
        let fieldXml = `
        <Field>
           <Name>${escapedName}</Name>
           <FieldType>${this.mapFieldType(col.FieldType)}</FieldType>`;

        if (col.MaxLength && this.isTextType(col.FieldType)) {
          fieldXml += `
           <MaxLength>${col.MaxLength}</MaxLength>`;
        }

        if (col.Scale !== undefined && col.FieldType === "Decimal") {
          fieldXml += `
           <Scale>${col.Scale}</Scale>`;
        }

        if (col.Precision !== undefined && col.FieldType === "Decimal") {
          fieldXml += `
           <Precision>${col.Precision}</Precision>`;
        }

        if (isPrimaryKey) {
          fieldXml += `
           <IsPrimaryKey>false</IsPrimaryKey>`;
        }

        fieldXml += `
        </Field>`;

        return fieldXml;
      })
      .join("");
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

  private async createQueryDefinition(
    job: ShellQueryJob,
    key: string,
    sql: string,
    deName: string,
    deObjectId: string,
    folderId: number,
  ): Promise<QueryDefinitionIds> {
    const { tenantId, userId, mid } = job;
    const escapedSql = this.escapeXml(sql);
    const escapedDeName = this.escapeXml(deName);

    await this.deleteQueryDefinitionIfExists(job, key);

    const soap = `
      <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <Objects xsi:type="QueryDefinition">
            <Name>${key}</Name>
            <CustomerKey>${key}</CustomerKey>
            <Description>Query++ execution ${job.runId}</Description>
            <QueryText>${escapedSql}</QueryText>
            <TargetType>DE</TargetType>
            <DataExtensionTarget>
               <ObjectID>${deObjectId}</ObjectID>
               <CustomerKey>${escapedDeName}</CustomerKey>
               <Name>${escapedDeName}</Name>
            </DataExtensionTarget>
            <TargetUpdateType>Overwrite</TargetUpdateType>
            <CategoryID>${folderId}</CategoryID>
         </Objects>
      </CreateRequest>`;

    const response = await this.mceBridge.soapRequest<SoapCreateResponse>(
      tenantId,
      userId,
      mid,
      soap,
      "Create",
    );

    this.logger.debug(
      `Create QueryDefinition response for ${key}: ${JSON.stringify(response)}`,
    );

    const result = response.Body?.CreateResponse?.Results;
    if (result && result.StatusCode !== "OK") {
      this.logger.error(
        `Create QueryDefinition failed - Full response: ${JSON.stringify(response, null, 2)}`,
      );
      throw new Error(
        `Failed to create QueryDefinition: ${result.StatusMessage}`,
      );
    }

    const objectId = result?.NewObjectID;
    const newId = result?.NewID;

    if (!objectId || typeof objectId !== "string") {
      throw new Error("QueryDefinition created but no ObjectID returned");
    }

    this.logger.log(
      `QueryDefinition created: ${key} (ObjectID: ${objectId}, NewID: ${newId ?? "N/A"})`,
    );

    return {
      objectId,
      definitionId: objectId,
    };
  }

  private async deleteQueryDefinitionIfExists(
    job: ShellQueryJob,
    key: string,
  ): Promise<void> {
    const { tenantId, userId, mid } = job;

    const retrieveSoap = `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            <ObjectType>QueryDefinition</ObjectType>
            <Properties>ObjectID</Properties>
            <Properties>CustomerKey</Properties>
            <Filter xsi:type="SimpleFilterPart">
               <Property>CustomerKey</Property>
               <SimpleOperator>equals</SimpleOperator>
               <Value>${this.escapeXml(key)}</Value>
            </Filter>
         </RetrieveRequest>
      </RetrieveRequestMsg>`;

    try {
      const retrieveResponse =
        await this.mceBridge.soapRequest<SoapRetrieveResponse>(
          tenantId,
          userId,
          mid,
          retrieveSoap,
          "Retrieve",
        );

      this.logger.debug(
        `Retrieve QueryDefinition response for ${key}: ${JSON.stringify(retrieveResponse)}`,
      );

      const results = retrieveResponse.Body?.RetrieveResponseMsg?.Results;
      if (!results) {
        this.logger.debug(
          `QueryDefinition ${key} not found, nothing to delete`,
        );
        return;
      }

      const queryDef = Array.isArray(results) ? results[0] : results;
      const objectId = queryDef?.ObjectID;

      if (!objectId) {
        this.logger.debug(
          `QueryDefinition ${key} has no ObjectID, cannot delete`,
        );
        return;
      }

      const deleteSoap = `
        <DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
           <Objects xsi:type="QueryDefinition">
              <ObjectID>${objectId}</ObjectID>
           </Objects>
        </DeleteRequest>`;

      const deleteResponse = await this.mceBridge.soapRequest(
        tenantId,
        userId,
        mid,
        deleteSoap,
        "Delete",
      );
      this.logger.debug(
        `Delete QueryDefinition response for ${key} (ObjectID: ${objectId}): ${JSON.stringify(deleteResponse)}`,
      );
    } catch (error) {
      this.logger.debug(
        `Delete QueryDefinition failed for ${key}: ${(error as Error).message}`,
      );
    }
  }

  private async performQuery(
    job: ShellQueryJob,
    queryObjectId: string,
  ): Promise<string> {
    const { tenantId, userId, mid } = job;
    const soap = `
      <PerformRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <Action>Start</Action>
         <Definitions>
            <Definition xsi:type="QueryDefinition">
               <ObjectID>${queryObjectId}</ObjectID>
            </Definition>
         </Definitions>
      </PerformRequestMsg>`;

    const response = await this.mceBridge.soapRequest<SoapPerformResponse>(
      tenantId,
      userId,
      mid,
      soap,
      "Perform",
    );

    this.logger.debug(
      `Perform QueryDefinition response for ObjectID ${queryObjectId}: ${JSON.stringify(response)}`,
    );

    const result = response.Body?.PerformResponseMsg?.Results?.Result;

    if (!result || result.StatusCode !== "OK") {
      this.logger.error(
        `Perform failed for ObjectID ${queryObjectId} - Full response: ${JSON.stringify(response, null, 2)}`,
      );
      throw new Error(
        `Failed to start query: ${result?.StatusMessage ?? "Unknown error"}`,
      );
    }

    const taskId = result.Task?.ID;
    if (!taskId) {
      throw new Error("TaskID not returned from query execution");
    }

    this.logger.log(`Query started with TaskID: ${taskId}`);
    return String(taskId);
  }
}

export class MceValidationError extends Error {
  readonly terminal = true;

  constructor(message: string) {
    super(message);
    this.name = "MceValidationError";
  }
}
