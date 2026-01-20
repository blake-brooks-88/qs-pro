export {
  AppError,
  appErrorToProblemDetails,
  ErrorCode,
  getErrorTitle,
  getHttpStatus,
  isTerminal,
  type ProblemDetails,
  toAppError,
} from "./common/errors";
export { SeatLimitExceededException } from "./common/exceptions/seat-limit-exceeded.exception";
export * from "./database/database.module";
export * from "./database/db-context";
export * from "./database/rls-context.service";
export { MceOperationError, McePaginationError } from "./mce/errors";
export * from "./mce/mce.module";
export {
  MCE_AUTH_PROVIDER,
  type MceAuthProvider,
} from "./mce/mce-auth.provider";
export * from "./mce/mce-bridge.service";
export { MetadataService } from "./mce/metadata.service";
export { buildQppResultsDataExtensionName } from "./mce/qpp-names";
export {
  buildIsRunningRequest,
  buildRowsetRequest,
} from "./mce/rest/request-bodies";
export {
  type IsRunningResponse,
  type RowsetItem,
  type RowsetResponse,
} from "./mce/rest/types";
export {
  type AsyncStatus,
  AsyncStatusService,
} from "./mce/services/async-status.service";
export {
  type CreateDataExtensionParams,
  type DataExtension,
  type DataExtensionField,
  DataExtensionService,
} from "./mce/services/data-extension.service";
export {
  type CreateDataFolderParams,
  type DataFolder,
  DataFolderService,
  type RetrieveDataFolderParams,
} from "./mce/services/data-folder.service";
export {
  type CreateQueryDefinitionParams,
  type QueryDefinition,
  QueryDefinitionService,
} from "./mce/services/query-definition.service";
export { RestDataService } from "./mce/services/rest-data.service";
export { escapeXml } from "./mce/soap/helpers";
export { buildDeleteQueryDefinition } from "./mce/soap/request-bodies/query-definition";
// Exporting AuthModule is tricky if it has controllers, but we might just need the service
export * from "./auth/auth.module";
export * from "./auth/auth.service";
export * from "./auth/seat-limit.service";
