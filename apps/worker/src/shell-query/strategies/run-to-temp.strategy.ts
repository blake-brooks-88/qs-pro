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
    const hash = runId.substring(0, 4);
    const deName = snippetName
      ? `QPP_${snippetName.replace(/\s+/g, "_")}_${hash}`
      : `QPP_Results_${hash}`;

    // 1. Validate query with MCE
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

    // 2. Expand SELECT * if needed and infer schema
    const metadataFetcher = this.createMetadataFetcher(job);
    let expandedSql = sqlText;

    if (containsSelectStar(sqlText)) {
      expandedSql = await expandSelectStar(sqlText, metadataFetcher);
      this.logger.debug(`Expanded SELECT * query: ${expandedSql}`);
    }

    // 3. Infer schema from expanded query
    const inferredSchema = await inferSchema(expandedSql, metadataFetcher);
    this.logger.debug(`Inferred schema with ${inferredSchema.length} columns`);

    // 4. Get or create QPP folder
    await publishStatus?.("creating_data_extension");
    const folderId = await this.ensureQppFolder(tenantId, userId, mid);

    // 5. Create Temp DE with inferred schema
    await this.createTempDe(job, deName, folderId, inferredSchema);

    // 6. Create Query Definition
    const queryCustomerKey = `QPP_Query_${runId}`;
    await this.createQueryDefinition(
      job,
      queryCustomerKey,
      expandedSql,
      deName,
      folderId,
    );

    // 7. Perform Start
    await publishStatus?.("executing_query");
    const taskId = await this.performQuery(job, queryCustomerKey);

    return {
      status: "ready",
      taskId,
    };
  }

  private createMetadataFetcher(job: ShellQueryJob): MetadataFetcher {
    const { tenantId, userId, mid } = job;

    return {
      getFieldsForTable: async (
        tableName: string,
      ): Promise<FieldDefinition[] | null> => {
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

          const response =
            await this.mceBridge.soapRequest<SoapRetrieveResponse>(
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
      },
    };
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
    // Check Cache
    const settings = await this.db
      .select()
      .from(tenantSettings)
      .where(
        and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.mid, mid)),
      );

    if (settings[0]?.qppFolderId) {
      return settings[0].qppFolderId;
    }

    // Search for existing folder named "QueryPlusPlus Results"
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
      // Create Folder
      const createSoap = `
        <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
           <Objects xsi:type="DataFolder">
              <Name>QueryPlusPlus Results</Name>
              <CustomerKey>QueryPlusPlus_Results</CustomerKey>
              <Description>Temporary storage for Query++ results</Description>
              <ContentType>dataextension</ContentType>
              <ParentFolder>
                 <Name>Data Extensions</Name>
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

    // Cache it
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
  ) {
    const { tenantId, userId, mid } = job;

    // Build field XML from inferred schema
    const fieldsXml = this.buildFieldsXml(schema);

    const soap = `
      <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <Objects xsi:type="DataExtension">
            <Name>${this.escapeXml(deName)}</Name>
            <CustomerKey>${this.escapeXml(deName)}</CustomerKey>
            <CategoryID>${folderId}</CategoryID>
            <IsSendable>false</IsSendable>
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
    const result = response.Body?.CreateResponse?.Results;
    if (result && result.StatusCode !== "OK" && result.ErrorCode !== "2") {
      this.logger.warn(`DE creation status: ${result.StatusMessage}`);
    }
  }

  private buildFieldsXml(schema: ColumnDefinition[]): string {
    if (schema.length === 0) {
      // Fallback schema if inference fails
      return `
        <Field>
           <Name>_QPP_ID</Name>
           <FieldType>Text</FieldType>
           <MaxLength>50</MaxLength>
           <IsPrimaryKey>true</IsPrimaryKey>
           <IsRequired>true</IsRequired>
        </Field>
        <Field>
           <Name>Data</Name>
           <FieldType>Text</FieldType>
           <MaxLength>4000</MaxLength>
        </Field>`;
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
    const mapping: Record<string, string> = {
      Text: "Text",
      Number: "Number",
      Decimal: "Decimal",
      Date: "Date",
      Boolean: "Boolean",
      EmailAddress: "EmailAddress",
      Phone: "Phone",
      Email: "EmailAddress",
    };
    return mapping[fieldType] ?? "Text";
  }

  private isTextType(fieldType: string): boolean {
    return ["Text", "EmailAddress", "Phone"].includes(fieldType);
  }

  private async createQueryDefinition(
    job: ShellQueryJob,
    key: string,
    sql: string,
    deName: string,
    folderId: number,
  ) {
    const { tenantId, userId, mid } = job;
    const escapedSql = this.escapeXml(sql);
    const escapedDeName = this.escapeXml(deName);

    const soap = `
      <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <Objects xsi:type="QueryDefinition">
            <Name>${key}</Name>
            <CustomerKey>${key}</CustomerKey>
            <Description>Query++ execution ${job.runId}</Description>
            <QueryText>${escapedSql}</QueryText>
            <TargetType>DE</TargetType>
            <DataExtensionTarget>
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
    const result = response.Body?.CreateResponse?.Results;
    if (result && result.StatusCode !== "OK") {
      throw new Error(
        `Failed to create QueryDefinition: ${result.StatusMessage}`,
      );
    }
  }

  private async performQuery(job: ShellQueryJob, key: string): Promise<string> {
    const { tenantId, userId, mid } = job;
    const soap = `
      <PerformRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <Action>Start</Action>
         <Definitions>
            <Definition xsi:type="QueryDefinition">
               <CustomerKey>${key}</CustomerKey>
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
    const result = response.Body?.PerformResponseMsg?.Results?.Result;

    if (!result || result.StatusCode !== "OK") {
      throw new Error(
        `Failed to start query: ${result?.StatusMessage ?? "Unknown error"}`,
      );
    }

    if (!result.TaskID) {
      throw new Error("TaskID not returned from query execution");
    }

    return result.TaskID;
  }
}

export class MceValidationError extends Error {
  readonly terminal = true;

  constructor(message: string) {
    super(message);
    this.name = "MceValidationError";
  }
}
