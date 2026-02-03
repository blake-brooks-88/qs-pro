import type { CreateQueryDefinitionParams } from "../../types/query-definition";
import { escapeXml } from "../helpers";

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
  } = params;

  return `<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Objects xsi:type="QueryDefinition">
    <Name>${escapeXml(name)}</Name>
    <CustomerKey>${escapeXml(customerKey)}</CustomerKey>
    <Description>Query++ execution</Description>
    <QueryText>${escapeXml(queryText)}</QueryText>
    <TargetType>DE</TargetType>
    <DataExtensionTarget>
      <ObjectID>${escapeXml(targetId)}</ObjectID>
      <CustomerKey>${escapeXml(targetCustomerKey)}</CustomerKey>
      <Name>${escapeXml(targetName)}</Name>
    </DataExtensionTarget>
    <TargetUpdateType>Overwrite</TargetUpdateType>
    <CategoryID>${categoryId}</CategoryID>
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

export function buildDeleteQueryDefinition(objectId: string): string {
  return `<DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Objects xsi:type="QueryDefinition">
    <ObjectID>${escapeXml(objectId)}</ObjectID>
  </Objects>
</DeleteRequest>`;
}
