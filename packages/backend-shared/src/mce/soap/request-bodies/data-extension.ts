import type { DataRetentionPolicy } from "@qpp/shared-types";

import type {
  CreateDataExtensionField,
  CreateDataExtensionParams,
} from "../../types/data-extension";
import { escapeXml } from "../helpers";

export function buildRetrieveDataExtensionFieldsByCustomerKey(
  customerKey: string,
): string {
  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <RetrieveRequest>
    <ObjectType>DataExtensionField</ObjectType>
    <Properties>Name</Properties>
    <Properties>FieldType</Properties>
    <Properties>MaxLength</Properties>
    <Properties>IsPrimaryKey</Properties>
    <Properties>IsRequired</Properties>
    <Filter xsi:type="SimpleFilterPart">
      <Property>DataExtension.CustomerKey</Property>
      <SimpleOperator>equals</SimpleOperator>
      <Value>${escapeXml(customerKey)}</Value>
    </Filter>
  </RetrieveRequest>
</RetrieveRequestMsg>`;
}

export function buildRetrieveDataExtensionFieldsByName(name: string): string {
  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <RetrieveRequest>
    <ObjectType>DataExtensionField</ObjectType>
    <Properties>Name</Properties>
    <Properties>FieldType</Properties>
    <Properties>MaxLength</Properties>
    <Properties>IsPrimaryKey</Properties>
    <Properties>IsRequired</Properties>
    <Filter xsi:type="SimpleFilterPart">
      <Property>DataExtension.Name</Property>
      <SimpleOperator>equals</SimpleOperator>
      <Value>${escapeXml(name)}</Value>
    </Filter>
  </RetrieveRequest>
</RetrieveRequestMsg>`;
}

export function buildRetrieveDataExtensionFields(
  params: { customerKey: string } | { name: string },
): string {
  if ("customerKey" in params) {
    return buildRetrieveDataExtensionFieldsByCustomerKey(params.customerKey);
  }
  return buildRetrieveDataExtensionFieldsByName(params.name);
}

function buildRetentionXml(retention: DataRetentionPolicy): string {
  const rowBasedRetention = retention.deleteType === "individual";
  const resetOnImport = retention.resetOnImport ? "true" : "false";
  const deleteAtEnd = retention.deleteAtEnd ? "true" : "false";

  if (retention.type === "period") {
    return `
	    <DataRetentionPeriodLength>${retention.periodLength}</DataRetentionPeriodLength>
	    <DataRetentionPeriod>${escapeXml(retention.periodUnit)}</DataRetentionPeriod>
	    <RowBasedRetention>${rowBasedRetention ? "true" : "false"}</RowBasedRetention>
	    <ResetRetentionPeriodOnImport>${resetOnImport}</ResetRetentionPeriodOnImport>
	    <DeleteAtEndOfRetentionPeriod>${deleteAtEnd}</DeleteAtEndOfRetentionPeriod>`;
  }

  // Use an explicit end-of-day UTC timestamp without relying on Date parsing,
  // which can throw for syntactically-valid but non-existent dates (e.g. 2026-02-30).
  // End-of-day avoids "today" becoming a timestamp in the past.
  const retainUntilIso = `${retention.retainUntil}T23:59:59.000Z`;
  return `
	    <RetainUntil>${escapeXml(retainUntilIso)}</RetainUntil>
	    <RowBasedRetention>${rowBasedRetention ? "true" : "false"}</RowBasedRetention>
	    <ResetRetentionPeriodOnImport>${resetOnImport}</ResetRetentionPeriodOnImport>
	    <DeleteAtEndOfRetentionPeriod>${deleteAtEnd}</DeleteAtEndOfRetentionPeriod>`;
}

function buildFieldsXml(fields: CreateDataExtensionField[]): string {
  return fields
    .map((field, index) => {
      const isPrimaryKey = field.isPrimaryKey ?? index === 0;
      const isTextType = ["Text", "EmailAddress", "Phone"].includes(
        field.fieldType,
      );

      let fieldXml = `<Field xsi:type="DataExtensionField">
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
      <IsRequired>${(field.isRequired ?? false) ? "true" : "false"}</IsRequired>`;

      if (field.defaultValue !== undefined) {
        fieldXml += `
      <DefaultValue>${escapeXml(field.defaultValue)}</DefaultValue>`;
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
  const isSendable = params.isSendable ?? false;
  const retentionXml = params.retention
    ? buildRetentionXml(params.retention)
    : "";

  let sendableXml = "";
  if (isSendable && params.sendableField && params.sendableFieldType) {
    sendableXml = `
	    <SendableDataExtensionField>
      <Name>${escapeXml(params.sendableField)}</Name>
      <FieldType>${escapeXml(params.sendableFieldType)}</FieldType>
    </SendableDataExtensionField>
    <SendableSubscriberField>
      <Name>Subscriber Key</Name>
    </SendableSubscriberField>`;
  }

  return `<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Objects xsi:type="DataExtension">
    <Name>${escapeXml(params.name)}</Name>
    <CustomerKey>${escapeXml(params.customerKey)}</CustomerKey>
    <CategoryID>${params.categoryId}</CategoryID>
    <IsSendable>${isSendable ? "true" : "false"}</IsSendable>
    ${retentionXml}${sendableXml}
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

export function buildRetrieveDataExtensionByName(name: string): string {
  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <RetrieveRequest>
    <ObjectType>DataExtension</ObjectType>
    <Properties>ObjectID</Properties>
    <Properties>CustomerKey</Properties>
    <Properties>Name</Properties>
    <Filter xsi:type="SimpleFilterPart">
      <Property>Name</Property>
      <SimpleOperator>equals</SimpleOperator>
      <Value>${escapeXml(name)}</Value>
    </Filter>
  </RetrieveRequest>
</RetrieveRequestMsg>`;
}
