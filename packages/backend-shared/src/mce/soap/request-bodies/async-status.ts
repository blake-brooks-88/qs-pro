import { escapeXml } from "../helpers";

export function buildRetrieveAsyncActivityStatus(taskId: string): string {
  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <RetrieveRequest>
    <ObjectType>AsyncActivityStatus</ObjectType>
    <Properties>Status</Properties>
    <Properties>ErrorMsg</Properties>
    <Properties>CompletedDate</Properties>
    <Filter xsi:type="SimpleFilterPart">
      <Property>TaskID</Property>
      <SimpleOperator>equals</SimpleOperator>
      <Value>${escapeXml(taskId)}</Value>
    </Filter>
  </RetrieveRequest>
</RetrieveRequestMsg>`;
}
