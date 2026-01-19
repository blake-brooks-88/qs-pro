import { escapeXml } from "../helpers";

export function buildRetrieveDataExtensionFields(
  dataExtensionName: string,
): string {
  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <RetrieveRequest>
    <ObjectType>DataExtensionField</ObjectType>
    <Properties>Name</Properties>
    <Properties>FieldType</Properties>
    <Properties>MaxLength</Properties>
    <Filter xsi:type="ComplexFilterPart">
      <LeftOperand xsi:type="SimpleFilterPart">
        <Property>DataExtension.CustomerKey</Property>
        <SimpleOperator>equals</SimpleOperator>
        <Value>${escapeXml(dataExtensionName)}</Value>
      </LeftOperand>
      <LogicalOperator>OR</LogicalOperator>
      <RightOperand xsi:type="SimpleFilterPart">
        <Property>DataExtension.Name</Property>
        <SimpleOperator>equals</SimpleOperator>
        <Value>${escapeXml(dataExtensionName)}</Value>
      </RightOperand>
    </Filter>
  </RetrieveRequest>
</RetrieveRequestMsg>`;
}

export interface DataExtensionField {
  name: string;
  fieldType: string;
  maxLength?: number;
  scale?: number;
  precision?: number;
  isPrimaryKey?: boolean;
}

export interface CreateDataExtensionParams {
  name: string;
  customerKey: string;
  categoryId: number;
  fields: DataExtensionField[];
}

function buildFieldsXml(fields: DataExtensionField[]): string {
  return fields
    .map((field, index) => {
      const isPrimaryKey = field.isPrimaryKey ?? index === 0;
      const isTextType = ["Text", "EmailAddress", "Phone"].includes(
        field.fieldType,
      );

      let fieldXml = `<Field>
      <Name>${escapeXml(field.name)}</Name>
      <FieldType>${escapeXml(field.fieldType)}</FieldType>`;

      if (field.maxLength !== undefined && isTextType) {
        fieldXml += `
      <MaxLength>${field.maxLength}</MaxLength>`;
      }

      if (field.scale !== undefined && field.fieldType === "Decimal") {
        fieldXml += `
      <Scale>${field.scale}</Scale>`;
      }

      if (field.precision !== undefined && field.fieldType === "Decimal") {
        fieldXml += `
      <Precision>${field.precision}</Precision>`;
      }

      if (isPrimaryKey !== undefined) {
        fieldXml += `
      <IsPrimaryKey>${isPrimaryKey ? "true" : "false"}</IsPrimaryKey>`;
      }

      fieldXml += `
    </Field>`;

      return fieldXml;
    })
    .join("");
}

export function buildCreateDataExtension(
  params: CreateDataExtensionParams,
): string {
  const fieldsXml = buildFieldsXml(params.fields);

  return `<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Objects xsi:type="DataExtension">
    <Name>${escapeXml(params.name)}</Name>
    <CustomerKey>${escapeXml(params.customerKey)}</CustomerKey>
    <CategoryID>${params.categoryId}</CategoryID>
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
}

export function buildDeleteDataExtension(customerKey: string): string {
  return `<DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Objects xsi:type="DataExtension">
    <CustomerKey>${escapeXml(customerKey)}</CustomerKey>
  </Objects>
</DeleteRequest>`;
}

export function buildRetrieveDataExtensions(clientId?: string): string {
  const clientContext = clientId
    ? `<ClientIDs><ClientID>${escapeXml(clientId)}</ClientID></ClientIDs>`
    : "";

  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <RetrieveRequest>
    ${clientContext}
    <ObjectType>DataExtension</ObjectType>
    <Properties>ObjectID</Properties>
    <Properties>CustomerKey</Properties>
    <Properties>Name</Properties>
    <Properties>CategoryID</Properties>
    <Properties>IsSendable</Properties>
  </RetrieveRequest>
</RetrieveRequestMsg>`;
}
