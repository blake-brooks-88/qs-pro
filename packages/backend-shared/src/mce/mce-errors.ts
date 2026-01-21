import { AppError, ErrorCode } from "../common/errors";

/**
 * Creates an AppError for MCE SOAP operation failures.
 *
 * Centralizes the common pattern of throwing MCE_SOAP_FAILURE errors
 * with operation context for debugging.
 */
export function mceSoapFailure(
  operation: string,
  status: string,
  statusMessage?: string,
): AppError {
  return new AppError(ErrorCode.MCE_SOAP_FAILURE, undefined, {
    operation,
    status,
    statusMessage,
  });
}
