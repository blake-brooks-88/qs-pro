import { escapeXml } from "../helpers";

export interface RetrieveDataFolderParams {
  name?: string;
  contentType?: string;
  clientId?: string;
}

export function buildRetrieveDataFolder(
  params: RetrieveDataFolderParams,
): string {
  const { name, contentType, clientId } = params;

  const clientContext = clientId
    ? `<ClientIDs><ClientID>${escapeXml(clientId)}</ClientID></ClientIDs>`
    : "";

  let filterXml = "";

  if (name && contentType) {
    filterXml = `<Filter xsi:type="ComplexFilterPart">
      <LeftOperand xsi:type="SimpleFilterPart">
        <Property>Name</Property>
        <SimpleOperator>equals</SimpleOperator>
        <Value>${escapeXml(name)}</Value>
      </LeftOperand>
      <LogicalOperator>AND</LogicalOperator>
      <RightOperand xsi:type="SimpleFilterPart">
        <Property>ContentType</Property>
        <SimpleOperator>equals</SimpleOperator>
        <Value>${escapeXml(contentType)}</Value>
      </RightOperand>
    </Filter>`;
  } else if (name) {
    filterXml = `<Filter xsi:type="SimpleFilterPart">
      <Property>Name</Property>
      <SimpleOperator>equals</SimpleOperator>
      <Value>${escapeXml(name)}</Value>
    </Filter>`;
  } else if (contentType) {
    filterXml = `<Filter xsi:type="SimpleFilterPart">
      <Property>ContentType</Property>
      <SimpleOperator>equals</SimpleOperator>
      <Value>${escapeXml(contentType)}</Value>
    </Filter>`;
  }

  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <RetrieveRequest>
    ${clientContext}
    <ObjectType>DataFolder</ObjectType>
    <Properties>ID</Properties>
    <Properties>Name</Properties>
    <Properties>ParentFolder.ID</Properties>
    <Properties>Description</Properties>
    ${filterXml}
  </RetrieveRequest>
</RetrieveRequestMsg>`;
}

export interface CreateDataFolderParams {
  name: string;
  parentFolderId: number;
  contentType: string;
}

export function buildCreateDataFolder(params: CreateDataFolderParams): string {
  const { name, parentFolderId, contentType } = params;

  return `<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <Objects xsi:type="DataFolder">
    <Name>${escapeXml(name)}</Name>
    <CustomerKey>${escapeXml(`${name}_${parentFolderId}`)}</CustomerKey>
    <Description>Temporary storage for Query++ results</Description>
    <ContentType>${escapeXml(contentType)}</ContentType>
    <ParentFolder>
      <ID>${parentFolderId}</ID>
    </ParentFolder>
  </Objects>
</CreateRequest>`;
}
