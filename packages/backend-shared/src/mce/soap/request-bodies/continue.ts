import { escapeXml } from "../helpers";

export function buildContinueRequest(requestId: string): string {
  return `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
  <ContinueRequest>${escapeXml(requestId)}</ContinueRequest>
</RetrieveRequestMsg>`;
}
