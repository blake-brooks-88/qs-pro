/**
 * Tests for execution gating logic.
 *
 * CRITICAL: These tests verify that only "error" and "prereq" severities
 * block query execution. "warning" is advisory only and NEVER blocks execution.
 *
 * This was a bug in the original implementation where warnings incorrectly
 * blocked execution.
 */

import { describe, test, expect } from "vitest";
import type { SqlDiagnostic } from "./types";
import {
  isBlockingDiagnostic,
  getFirstBlockingDiagnostic,
  hasBlockingDiagnostics,
  BLOCKING_SEVERITIES,
} from "./types";

describe("Execution Gating", () => {
  describe("BLOCKING_SEVERITIES constant", () => {
    test("includes_error", () => {
      expect(BLOCKING_SEVERITIES.has("error")).toBe(true);
    });

    test("includes_prereq", () => {
      expect(BLOCKING_SEVERITIES.has("prereq")).toBe(true);
    });

    test("excludes_warning", () => {
      expect(BLOCKING_SEVERITIES.has("warning")).toBe(false);
    });
  });

  describe("isBlockingDiagnostic", () => {
    test("error_blocks_execution", () => {
      const diagnostic: SqlDiagnostic = {
        message: "Syntax error",
        severity: "error",
        startIndex: 0,
        endIndex: 10,
      };
      expect(isBlockingDiagnostic(diagnostic)).toBe(true);
    });

    test("prereq_blocks_execution", () => {
      const diagnostic: SqlDiagnostic = {
        message: "Missing SELECT clause",
        severity: "prereq",
        startIndex: 0,
        endIndex: 0,
      };
      expect(isBlockingDiagnostic(diagnostic)).toBe(true);
    });

    test("warning_NEVER_blocks_execution", () => {
      const diagnostic: SqlDiagnostic = {
        message: "Consider using table alias",
        severity: "warning",
        startIndex: 0,
        endIndex: 10,
      };
      expect(isBlockingDiagnostic(diagnostic)).toBe(false);
    });
  });

  describe("hasBlockingDiagnostics", () => {
    test("returns_false_for_empty_array", () => {
      expect(hasBlockingDiagnostics([])).toBe(false);
    });

    test("returns_true_when_error_present", () => {
      const diagnostics: SqlDiagnostic[] = [
        { message: "Error", severity: "error", startIndex: 0, endIndex: 10 },
      ];
      expect(hasBlockingDiagnostics(diagnostics)).toBe(true);
    });

    test("returns_true_when_prereq_present", () => {
      const diagnostics: SqlDiagnostic[] = [
        {
          message: "Missing SELECT",
          severity: "prereq",
          startIndex: 0,
          endIndex: 0,
        },
      ];
      expect(hasBlockingDiagnostics(diagnostics)).toBe(true);
    });

    test("returns_false_when_only_warnings_present", () => {
      const diagnostics: SqlDiagnostic[] = [
        {
          message: "Warning 1",
          severity: "warning",
          startIndex: 0,
          endIndex: 10,
        },
        {
          message: "Warning 2",
          severity: "warning",
          startIndex: 20,
          endIndex: 30,
        },
      ];
      expect(hasBlockingDiagnostics(diagnostics)).toBe(false);
    });

    test("returns_true_when_error_and_warnings_present", () => {
      const diagnostics: SqlDiagnostic[] = [
        {
          message: "Warning",
          severity: "warning",
          startIndex: 0,
          endIndex: 10,
        },
        { message: "Error", severity: "error", startIndex: 20, endIndex: 30 },
      ];
      expect(hasBlockingDiagnostics(diagnostics)).toBe(true);
    });
  });

  describe("getFirstBlockingDiagnostic", () => {
    test("returns_null_for_empty_array", () => {
      expect(getFirstBlockingDiagnostic([])).toBeNull();
    });

    test("returns_null_when_only_warnings_present", () => {
      const diagnostics: SqlDiagnostic[] = [
        {
          message: "Warning 1",
          severity: "warning",
          startIndex: 0,
          endIndex: 10,
        },
        {
          message: "Warning 2",
          severity: "warning",
          startIndex: 20,
          endIndex: 30,
        },
      ];
      expect(getFirstBlockingDiagnostic(diagnostics)).toBeNull();
    });

    test("returns_error_when_only_error_present", () => {
      const error: SqlDiagnostic = {
        message: "Syntax error",
        severity: "error",
        startIndex: 0,
        endIndex: 10,
      };
      expect(getFirstBlockingDiagnostic([error])).toBe(error);
    });

    test("returns_prereq_when_only_prereq_present", () => {
      const prereq: SqlDiagnostic = {
        message: "Missing SELECT",
        severity: "prereq",
        startIndex: 0,
        endIndex: 0,
      };
      expect(getFirstBlockingDiagnostic([prereq])).toBe(prereq);
    });

    test("prioritizes_error_over_prereq", () => {
      const prereq: SqlDiagnostic = {
        message: "Missing SELECT",
        severity: "prereq",
        startIndex: 0,
        endIndex: 0,
      };
      const error: SqlDiagnostic = {
        message: "Syntax error",
        severity: "error",
        startIndex: 10,
        endIndex: 20,
      };
      // prereq first in array, error second
      const diagnostics = [prereq, error];
      expect(getFirstBlockingDiagnostic(diagnostics)).toBe(error);
    });

    test("prioritizes_error_over_warning", () => {
      const warning: SqlDiagnostic = {
        message: "Consider alias",
        severity: "warning",
        startIndex: 0,
        endIndex: 10,
      };
      const error: SqlDiagnostic = {
        message: "Syntax error",
        severity: "error",
        startIndex: 20,
        endIndex: 30,
      };
      const diagnostics = [warning, error];
      expect(getFirstBlockingDiagnostic(diagnostics)).toBe(error);
    });

    test("ignores_warnings_and_returns_prereq", () => {
      const warning: SqlDiagnostic = {
        message: "Consider alias",
        severity: "warning",
        startIndex: 0,
        endIndex: 10,
      };
      const prereq: SqlDiagnostic = {
        message: "Missing SELECT",
        severity: "prereq",
        startIndex: 20,
        endIndex: 20,
      };
      const diagnostics = [warning, prereq];
      expect(getFirstBlockingDiagnostic(diagnostics)).toBe(prereq);
    });

    test("returns_first_error_when_multiple_errors", () => {
      const error1: SqlDiagnostic = {
        message: "First error",
        severity: "error",
        startIndex: 0,
        endIndex: 10,
      };
      const error2: SqlDiagnostic = {
        message: "Second error",
        severity: "error",
        startIndex: 20,
        endIndex: 30,
      };
      const diagnostics = [error1, error2];
      expect(getFirstBlockingDiagnostic(diagnostics)).toBe(error1);
    });
  });

  describe("Bug Fix: Warnings do not block execution", () => {
    /**
     * This is the key behavior change from the bug fix.
     * Previously, the code was:
     *   hasBlockingDiagnostics = sqlDiagnostics.length > 0
     *
     * This meant ANY diagnostic (including warnings) would block execution.
     *
     * The fix ensures only "error" and "prereq" block execution.
     */

    test("query_with_only_warnings_can_execute", () => {
      // SELECT * FROM Table is valid but generates a warning about SELECT *
      const warningDiagnostics: SqlDiagnostic[] = [
        {
          message:
            "SELECT * is allowed for simple queries but may cause issues",
          severity: "warning",
          startIndex: 0,
          endIndex: 8,
        },
      ];

      // This should return FALSE because warnings don't block
      expect(hasBlockingDiagnostics(warningDiagnostics)).toBe(false);

      // This should return NULL because there's no blocking diagnostic
      expect(getFirstBlockingDiagnostic(warningDiagnostics)).toBeNull();
    });

    test("query_with_errors_and_warnings_blocks_on_error", () => {
      const mixedDiagnostics: SqlDiagnostic[] = [
        {
          message: "SELECT * warning",
          severity: "warning",
          startIndex: 0,
          endIndex: 8,
        },
        {
          message: "Missing FROM clause",
          severity: "error",
          startIndex: 9,
          endIndex: 9,
        },
      ];

      // Should block due to error
      expect(hasBlockingDiagnostics(mixedDiagnostics)).toBe(true);

      // Should return the error, not the warning
      const blocking = getFirstBlockingDiagnostic(mixedDiagnostics);
      expect(blocking?.severity).toBe("error");
      expect(blocking?.message).toBe("Missing FROM clause");
    });
  });
});
