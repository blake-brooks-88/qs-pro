export interface IsRunningRequest {
  method: "GET";
  url: string;
}

export function buildIsRunningRequest(queryId: string): IsRunningRequest {
  if (!queryId || queryId.trim() === "") {
    throw new Error("queryId must not be empty");
  }

  const encodedId = encodeURIComponent(queryId);

  return {
    method: "GET",
    url: `/automation/v1/queries/${encodedId}/actions/isrunning/`,
  };
}
