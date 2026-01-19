interface RetrieveResult {
  ID?: string;
  Status?: string;
  ErrorMsg?: string;
  CustomerKey?: string;
  Name?: string;
  ObjectID?: string;
  [key: string]: unknown;
}

export interface SoapRetrieveResponse {
  Body?: {
    RetrieveResponseMsg?: {
      OverallStatus?: string;
      RequestID?: string;
      Results?: RetrieveResult | RetrieveResult[];
    };
  };
}

interface AsyncStatusProperty {
  Name: string;
  Value: string;
}

interface AsyncStatusResult {
  PartnerKey?: string;
  ObjectID?: string;
  Type?: string;
  Properties?: {
    Property?: AsyncStatusProperty | AsyncStatusProperty[];
  };
  Status?: string;
  ErrorMsg?: string;
}

export interface SoapAsyncStatusResponse {
  Body?: {
    RetrieveResponseMsg?: {
      OverallStatus?: string;
      RequestID?: string;
      Results?: AsyncStatusResult;
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
        NewObjectID?: string;
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
          Task?: {
            StatusCode?: string;
            StatusMessage?: string;
            ID?: string;
            InteractionObjectID?: string;
          };
          [key: string]: unknown;
        };
      };
    };
  };
}

export interface SoapDeleteResponse {
  Body?: {
    DeleteResponse?: {
      Results?: {
        StatusCode?: string;
        StatusMessage?: string;
        ErrorCode?: string;
        [key: string]: unknown;
      };
    };
  };
}
