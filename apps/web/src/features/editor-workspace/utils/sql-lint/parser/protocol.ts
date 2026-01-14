/**
 * Worker Protocol for SQL Linting
 *
 * This module defines the message types for communication between the main thread
 * and the SQL linting web worker.
 */

import type { SqlDiagnostic } from "../types";

/**
 * Message types sent from main thread to worker
 */
export type WorkerRequest = LintRequest | InitRequest;

export interface InitRequest {
  type: "init";
}

export interface LintRequest {
  type: "lint";
  /** Unique identifier for this lint request (for cancellation/deduplication) */
  requestId: string;
  /** SQL content to lint */
  sql: string;
}

/**
 * Message types sent from worker to main thread
 */
export type WorkerResponse = LintResponse | ReadyResponse | ErrorResponse;

export interface ReadyResponse {
  type: "ready";
}

export interface LintResponse {
  type: "lint-result";
  /** Matches the requestId from the request */
  requestId: string;
  /** Diagnostics produced by the AST parser */
  diagnostics: SqlDiagnostic[];
  /** Time in ms to parse and lint */
  duration: number;
}

export interface ErrorResponse {
  type: "error";
  /** Matches the requestId if available */
  requestId?: string;
  /** Error message */
  message: string;
}

/**
 * Creates a unique request ID for lint requests.
 * Uses timestamp + random suffix for uniqueness.
 */
export function createRequestId(): string {
  return `lint-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
