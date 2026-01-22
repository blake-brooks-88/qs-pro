import { AppError, safeContext } from '@qpp/backend-shared';

/**
 * Handles fatal startup errors with structured logging.
 * @param error - The error that caused startup failure
 * @param exit - Injectable exit function (default: process.exit) for testability
 */
export function handleFatalError(
  error: unknown,
  exit: (code: number) => never = (code) => process.exit(code),
): never {
  console.error('\n[FATAL] Application failed to start\n');

  if (error instanceof AppError) {
    console.error(`  Code:    ${error.code}`);
    console.error(`  Message: ${error.message}`);
    const redacted = safeContext(error.context);
    if (redacted) {
      console.error(`  Context: ${JSON.stringify(redacted, null, 2)}`);
    }
  } else if (error instanceof Error) {
    console.error(`  Error:   ${error.message}`);
    console.error(`  Stack:   ${error.stack}`);
  } else {
    console.error(`  Unknown error:`, error);
  }

  console.error('');
  exit(1);
}
