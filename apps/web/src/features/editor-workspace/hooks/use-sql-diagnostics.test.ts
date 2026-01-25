import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SqlDiagnostic } from "@/features/editor-workspace/utils/sql-lint/types";

import { useSqlDiagnostics } from "./use-sql-diagnostics";

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  postMessage = vi.fn();
  terminate = vi.fn();

  constructor(_url: string | URL, _options?: WorkerOptions) {
    MockWorker.instances.push(this);
  }

  emitMessage(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  static reset() {
    MockWorker.instances = [];
  }

  static latest(): MockWorker {
    const latest = MockWorker.instances.at(-1);
    if (!latest) {
      throw new Error("No Worker instance created");
    }
    return latest;
  }
}

describe("useSqlDiagnostics", () => {
  beforeEach(() => {
    MockWorker.reset();
    vi.useFakeTimers();
    vi.stubGlobal("Worker", MockWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("posts lint request after debounce and applies matching worker result", async () => {
    const lintResultDiagnostics: SqlDiagnostic[] = [
      {
        message: "Worker rule error",
        severity: "error",
        startIndex: 0,
        endIndex: 6,
      },
    ];

    const { result } = renderHook(() =>
      useSqlDiagnostics({ sql: "SELECT * FROM A", debounceMs: 50 }),
    );

    await act(async () => {});
    expect(result.current.isAsyncLinting).toBe(true);

    act(() => {
      vi.advanceTimersByTime(50);
    });

    const worker = MockWorker.latest();

    const lintCall = worker.postMessage.mock.calls.find(
      ([message]) =>
        Boolean(message) &&
        typeof message === "object" &&
        "type" in (message as Record<string, unknown>) &&
        (message as { type: string }).type === "lint",
    );
    expect(lintCall).toBeDefined();

    const [lintRequest] = lintCall ?? [];
    expect(lintRequest).toMatchObject({ type: "lint", sql: "SELECT * FROM A" });

    const requestId = (lintRequest as { requestId?: string }).requestId;
    expect(typeof requestId).toBe("string");

    act(() => {
      worker.emitMessage({
        type: "lint-result",
        requestId,
        diagnostics: lintResultDiagnostics,
        duration: 12,
      });
    });

    expect(result.current.isAsyncLinting).toBe(false);
    expect(result.current.asyncDiagnostics).toEqual(lintResultDiagnostics);
    expect(result.current.lastLintDuration).toBe(12);
  });

  it("ignores stale worker results when a newer request is in flight", async () => {
    const { result, rerender } = renderHook(
      ({ sql }: { sql: string }) => useSqlDiagnostics({ sql, debounceMs: 10 }),
      { initialProps: { sql: "SELECT * FROM A" } },
    );

    await act(async () => {});
    expect(result.current.isAsyncLinting).toBe(true);

    act(() => {
      vi.advanceTimersByTime(10);
    });

    const worker = MockWorker.latest();
    const firstLint = worker.postMessage.mock.calls.find(
      ([message]) =>
        (message as { type?: string } | undefined)?.type === "lint",
    )?.[0] as { requestId: string };

    act(() => {
      rerender({ sql: "SELECT * FROM B" });
    });
    await act(async () => {});

    act(() => {
      vi.advanceTimersByTime(10);
    });

    const lintMessages = worker.postMessage.mock.calls
      .map(([message]) => message as { type?: string; requestId?: string })
      .filter((message) => message.type === "lint");

    expect(lintMessages).toHaveLength(2);
    const secondLint = lintMessages[1];
    if (!secondLint?.requestId) {
      throw new Error("Second lint request missing requestId");
    }

    act(() => {
      worker.emitMessage({
        type: "lint-result",
        requestId: firstLint.requestId,
        diagnostics: [
          { message: "stale", severity: "error", startIndex: 0, endIndex: 1 },
        ],
        duration: 1,
      });
    });

    expect(result.current.asyncDiagnostics).toEqual([]);

    act(() => {
      worker.emitMessage({
        type: "lint-result",
        requestId: secondLint.requestId,
        diagnostics: [
          {
            message: "fresh",
            severity: "error",
            startIndex: 0,
            endIndex: 1,
          },
        ],
        duration: 2,
      });
    });

    expect(result.current.asyncDiagnostics[0]?.message).toBe("fresh");
  });

  it("terminates worker on unmount", async () => {
    const { unmount } = renderHook(() =>
      useSqlDiagnostics({ sql: "SELECT * FROM A", debounceMs: 1 }),
    );

    await act(async () => {});
    act(() => {
      vi.advanceTimersByTime(1);
    });

    const worker = MockWorker.latest();

    unmount();

    expect(worker.terminate).toHaveBeenCalled();
  });
});
