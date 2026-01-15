/**
 * SOAP response types for MCE API calls
 */

/** Generic retrieve response result structure */
interface RetrieveResult {
  ID?: string;
  Status?: string;
  ErrorMsg?: string;
  CustomerKey?: string;
  Name?: string;
  [key: string]: unknown;
}

/** Response for retrieve operations that return single or multiple results */
export interface SoapRetrieveResponse {
  Body?: {
    RetrieveResponseMsg?: {
      Results?: RetrieveResult | RetrieveResult[];
    };
  };
}

/** Response for AsyncActivityStatus queries (always single result) */
export interface SoapAsyncStatusResponse {
  Body?: {
    RetrieveResponseMsg?: {
      Results?: RetrieveResult;
    };
  };
}

export interface SoapCreateResponse {
  Body?: {
    CreateResponse?: {
      Results?: {
        StatusCode?: string;
        StatusMessage?: string;
        NewID?: string;
        ErrorCode?: string;
        [key: string]: unknown;
      };
    };
  };
}

export interface SoapPerformResponse {
  Body?: {
    PerformResponseMsg?: {
      Results?: {
        Result?: {
          StatusCode?: string;
          StatusMessage?: string;
          TaskID?: string;
          [key: string]: unknown;
        };
      };
    };
  };
}

export interface ShellQueryJob {
  runId: string;
  tenantId: string;
  userId: string;
  mid: string;
  eid: string;
  sqlText: string;
  snippetName?: string;
}

export interface FlowResult {
  status: "ready" | "failed" | "canceled";
  taskId?: string;
  errorMessage?: string;
}

export interface IFlowStrategy {
  execute(job: ShellQueryJob): Promise<FlowResult>;
}
