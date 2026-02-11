import type { CreateQueryDefinitionParams } from "../../types/query-definition";
import { escapeXml } from "../helpers";

export function buildRetrieveQueryDefinitionByNameAndFolder(params: {
  name: string;
  categoryId?: number;
}): string {
  const { name, categoryId } = params;

  const filter =
    categoryId !== undefined
      ? `<Filter xsi:type="ComplexFilterPart">
      <LeftOperand xsi:type="SimpleFilterPart">
        <Property>Name</Property>
        <SimpleOperator>equals</SimpleOperator>
        <Value>${escapeXml(name)}</Value>
      </LeftOperand>
      <LogicalOperator>AND</LogicalOperator>
      <RightOperand xsi:type="SimpleFilterPart">
        <Property>CategoryID</Property>
        <SimpleOperator>equals</SimpleOperator>
        <Value>${categoryId}</Value>
      </RightOperand>
    </Filter>`
      : `<Filter xsi:type="SimpleFilterPart">
      <Property>Name</Property>
      <SimpleOperator>equals</SimpleOperator>
      <Value>${escapeXml(name)}</Value>
    </Filter>`;

  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <RetrieveRequest>
    <ObjectType>QueryDefinition</ObjectType>
    <Properties>ObjectID</Properties>
    <Properties>CustomerKey</Properties>
    <Properties>Name</Properties>
    <Properties>CategoryID</Properties>
    ${filter}
  </RetrieveRequest>
</RetrieveRequestMsg>`;
}

export function buildRetrieveQueryDefinition(customerKey: string): string {
  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <RetrieveRequest>
    <ObjectType>QueryDefinition</ObjectType>
    <Properties>ObjectID</Properties>
    <Properties>CustomerKey</Properties>
    <Filter xsi:type="SimpleFilterPart">
      <Property>CustomerKey</Property>
      <SimpleOperator>equals</SimpleOperator>
      <Value>${escapeXml(customerKey)}</Value>
    </Filter>
  </RetrieveRequest>
</RetrieveRequestMsg>`;
}

export function buildCreateQueryDefinition(
  params: CreateQueryDefinitionParams,
): string {
  const {
    name,
    customerKey,
    categoryId,
    targetId,
    targetCustomerKey,
    targetName,
    queryText,
    description,
    targetUpdateType,
  } = params;

  // Only include CategoryID if a valid folder ID is provided (> 0)
  // MCE rejects CategoryID=0 as there's no folder with ID 0
  const categoryIdXml =
    categoryId && categoryId > 0
      ? `<CategoryID>${categoryId}</CategoryID>`
      : "";

  return `<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Objects xsi:type="QueryDefinition">
    <Name>${escapeXml(name)}</Name>
    <CustomerKey>${escapeXml(customerKey)}</CustomerKey>
    <Description>${escapeXml(description ?? "Query++ execution")}</Description>
    <QueryText>${escapeXml(queryText)}</QueryText>
    <TargetType>DE</TargetType>
    <DataExtensionTarget>
      <ObjectID>${escapeXml(targetId)}</ObjectID>
      <CustomerKey>${escapeXml(targetCustomerKey)}</CustomerKey>
      <Name>${escapeXml(targetName)}</Name>
    </DataExtensionTarget>
    <TargetUpdateType>${escapeXml(targetUpdateType ?? "Overwrite")}</TargetUpdateType>
    ${categoryIdXml}
  </Objects>
</CreateRequest>`;
}

export function buildPerformQueryDefinition(objectId: string): string {
  return `<PerformRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Action>Start</Action>
  <Definitions>
    <Definition xsi:type="QueryDefinition">
      <ObjectID>${escapeXml(objectId)}</ObjectID>
    </Definition>
  </Definitions>
</PerformRequestMsg>`;
}

export function buildRetrieveAllQueryDefinitions(): string {
  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <RetrieveRequest>
    <ObjectType>QueryDefinition</ObjectType>
    <Properties>ObjectID</Properties>
    <Properties>CustomerKey</Properties>
    <Properties>Name</Properties>
    <Properties>CategoryID</Properties>
    <Properties>TargetUpdateType</Properties>
    <Properties>ModifiedDate</Properties>
    <Properties>Status</Properties>
    <Properties>DataExtensionTarget.Name</Properties>
  </RetrieveRequest>
</RetrieveRequestMsg>`;
}

export function buildRetrieveQueryDefinitionDetail(
  customerKey: string,
): string {
  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <RetrieveRequest>
    <ObjectType>QueryDefinition</ObjectType>
    <Properties>ObjectID</Properties>
    <Properties>CustomerKey</Properties>
    <Properties>Name</Properties>
    <Properties>CategoryID</Properties>
    <Properties>QueryText</Properties>
    <Properties>TargetUpdateType</Properties>
    <Properties>DataExtensionTarget.Name</Properties>
    <Properties>DataExtensionTarget.CustomerKey</Properties>
    <Properties>ModifiedDate</Properties>
    <Properties>Status</Properties>
    <Filter xsi:type="SimpleFilterPart">
      <Property>CustomerKey</Property>
      <SimpleOperator>equals</SimpleOperator>
      <Value>${escapeXml(customerKey)}</Value>
    </Filter>
  </RetrieveRequest>
</RetrieveRequestMsg>`;
}

export function buildDeleteQueryDefinition(objectId: string): string {
  return `<DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Objects xsi:type="QueryDefinition">
    <ObjectID>${escapeXml(objectId)}</ObjectID>
  </Objects>
</DeleteRequest>`;
}
