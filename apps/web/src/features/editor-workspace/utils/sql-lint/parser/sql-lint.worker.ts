/**
 * SQL Lint Web Worker
 *
 * This worker handles AST-based SQL linting off the main thread.
 * It receives SQL content, parses it using node-sql-parser, and returns diagnostics.
 *
 * Usage:
 *   const worker = new Worker(new URL('./sql-lint.worker.ts', import.meta.url), { type: 'module' })
 *   worker.postMessage({ type: 'lint', requestId: '...', sql: '...' })
 */

import { parseAndLint } from "./ast-parser";
import type { WorkerRequest, WorkerResponse } from "./protocol";

/**
 * Handle incoming messages from main thread
 */
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    switch (request.type) {
      case "init":
        handleInit();
        break;
      case "lint":
        handleLint(request.requestId, request.sql);
        break;
      default:
        // Type guard exhaustiveness
        sendError(
          undefined,
          `Unknown request type: ${(request as { type: string }).type}`,
        );
    }
  } catch (err) {
    const error = err as Error;
    const requestId = "requestId" in request ? request.requestId : undefined;
    sendError(requestId, error.message);
  }
};

/**
 * Handle init request - warm up the parser
 */
function handleInit(): void {
  // Warm up the parser with a simple query
  try {
    parseAndLint("SELECT 1");
    sendReady();
  } catch (initError) {
    // Parser init failed - still report ready but log the issue
    // In production, this would be sent to error monitoring
    console.warn("[sql-lint.worker] Parser init failed", initError);
    sendReady();
  }
}

/**
 * Handle lint request - parse SQL and return diagnostics
 */
function handleLint(requestId: string, sql: string): void {
  const startTime = performance.now();

  const diagnostics = parseAndLint(sql);

  const duration = performance.now() - startTime;

  sendLintResult(requestId, diagnostics, duration);
}

/**
 * Send ready response
 */
function sendReady(): void {
  const response: WorkerResponse = { type: "ready" };
  self.postMessage(response);
}

/**
 * Send lint result response
 */
function sendLintResult(
  requestId: string,
  diagnostics: import("../types").SqlDiagnostic[],
  duration: number,
): void {
  const response: WorkerResponse = {
    type: "lint-result",
    requestId,
    diagnostics,
    duration,
  };
  self.postMessage(response);
}

/**
 * Send error response
 */
function sendError(requestId: string | undefined, message: string): void {
  const response: WorkerResponse = {
    type: "error",
    requestId,
    message,
  };
  self.postMessage(response);
}
