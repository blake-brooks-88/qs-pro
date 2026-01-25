import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { createElement } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { useQueryExecution } from "./use-query-execution";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const mockToastError = vi.mocked(toast.error);

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  readyState = 0;

  constructor(url: string, options?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = options?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  close = vi.fn(() => {
    this.readyState = 2;
  });

  simulateMessage(data: object) {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent("message", { data: JSON.stringify(data) }),
      );
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }

  static reset() {
    MockEventSource.instances = [];
  }

  static getLatest(): MockEventSource {
    const latest =
      MockEventSource.instances[MockEventSource.instances.length - 1];
    if (!latest) {
      throw new Error("No EventSource instance created");
    }
    return latest;
  }
}

describe("useQueryExecution", () => {
  const mockSessionStorage = new Map<string, string>();

  const createQueryClient = () => {
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  };

  const createWrapper = (queryClient: QueryClient) => {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );
    };
  };

  const renderUseQueryExecution = () => {
    const queryClient = createQueryClient();
    return renderHook(() => useQueryExecution(), {
      wrapper: createWrapper(queryClient),
    });
  };

  beforeEach(() => {
    MockEventSource.reset();
    mockToastError.mockClear();
    mockSessionStorage.clear();

    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => mockSessionStorage.get(key) ?? null,
      setItem: (key: string, value: string) =>
        mockSessionStorage.set(key, value),
      removeItem: (key: string) => mockSessionStorage.delete(key),
    });

    server.use(
      http.get("/api/runs/:runId/results", () => {
        return HttpResponse.json({
          columns: [],
          rows: [],
          totalRows: 0,
          page: 1,
          pageSize: 50,
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("execute() calls POST /api/runs and returns runId", async () => {
    let capturedBody: unknown = null;

    server.use(
      http.post("/api/runs", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          { runId: "run-123", status: "queued" },
          { status: 201 },
        );
      }),
    );

    const { result } = renderUseQueryExecution();

    await act(async () => {
      await result.current.execute("SELECT * FROM DE", "test-snippet");
    });

    expect(capturedBody).toEqual({
      sqlText: "SELECT * FROM DE",
      snippetName: "test-snippet",
      tableMetadata: {},
    });
    expect(result.current.runId).toBe("run-123");
    expect(result.current.status).toBe("queued");
  });

  it("opens EventSource to /api/runs/:runId/events after execute", async () => {
    server.use(
      http.post("/api/runs", () => {
        return HttpResponse.json(
          { runId: "run-456", status: "queued" },
          { status: 201 },
        );
      }),
    );

    const { result } = renderUseQueryExecution();

    await act(async () => {
      await result.current.execute("SELECT * FROM DE");
    });

    const eventSource = MockEventSource.getLatest();
    expect(eventSource.url).toBe("/api/runs/run-456/events");
    expect(eventSource.withCredentials).toBe(true);
  });

  it("status transitions through states (queued -> running -> ready)", async () => {
    server.use(
      http.post("/api/runs", () => {
        return HttpResponse.json(
          { runId: "run-789", status: "queued" },
          { status: 201 },
        );
      }),
    );

    const { result } = renderUseQueryExecution();

    await act(async () => {
      await result.current.execute("SELECT * FROM DE");
    });

    expect(result.current.status).toBe("queued");

    const eventSource = MockEventSource.getLatest();

    await act(async () => {
      eventSource.simulateMessage({
        status: "executing_query",
        message: "Executing query...",
      });
    });

    expect(result.current.status).toBe("executing_query");

    await act(async () => {
      eventSource.simulateMessage({
        status: "ready",
        message: "Query completed",
      });
    });

    expect(result.current.status).toBe("ready");
  });

  it("status failed sets errorMessage and resets running state", async () => {
    server.use(
      http.post("/api/runs", () => {
        return HttpResponse.json(
          { runId: "run-failed", status: "queued" },
          { status: 201 },
        );
      }),
    );

    const { result } = renderUseQueryExecution();

    await act(async () => {
      await result.current.execute("SELECT * FROM DE");
    });

    const eventSource = MockEventSource.getLatest();

    await act(async () => {
      eventSource.simulateMessage({
        status: "failed",
        message: "Query failed",
        errorMessage: "Invalid syntax near FROM",
        timestamp: new Date().toISOString(),
        runId: "run-failed",
      });
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.errorMessage).toBe("Invalid syntax near FROM");
    expect(result.current.isRunning).toBe(false);
    expect(mockSessionStorage.get("activeRunId")).toBeUndefined();
    expect(eventSource.close).toHaveBeenCalled();
  });

  it("cancel() calls POST /api/runs/:runId/cancel", async () => {
    let cancelCalled = false;

    server.use(
      http.post("/api/runs", () => {
        return HttpResponse.json(
          { runId: "run-cancel-test", status: "queued" },
          { status: 201 },
        );
      }),
      http.post("/api/runs/run-cancel-test/cancel", () => {
        cancelCalled = true;
        return HttpResponse.json({ status: "canceled" });
      }),
    );

    const { result } = renderUseQueryExecution();

    await act(async () => {
      await result.current.execute("SELECT * FROM DE");
    });

    await act(async () => {
      await result.current.cancel();
    });

    expect(cancelCalled).toBe(true);
    expect(result.current.status).toBe("canceled");
  });

  it("EventSource closes on terminal states (ready/failed/canceled)", async () => {
    server.use(
      http.post("/api/runs", () => {
        return HttpResponse.json(
          { runId: "run-terminal", status: "queued" },
          { status: 201 },
        );
      }),
    );

    const { result } = renderUseQueryExecution();

    await act(async () => {
      await result.current.execute("SELECT * FROM DE");
    });

    const eventSource = MockEventSource.getLatest();
    expect(eventSource.close).not.toHaveBeenCalled();

    await act(async () => {
      eventSource.simulateMessage({
        status: "ready",
        message: "Query completed",
      });
    });

    expect(eventSource.close).toHaveBeenCalled();
  });

  it("isRunning returns true when status is non-terminal", async () => {
    server.use(
      http.post("/api/runs", () => {
        return HttpResponse.json(
          { runId: "run-isrunning", status: "queued" },
          { status: 201 },
        );
      }),
    );

    const { result } = renderUseQueryExecution();

    expect(result.current.isRunning).toBe(false);

    await act(async () => {
      await result.current.execute("SELECT * FROM DE");
    });

    expect(result.current.isRunning).toBe(true);

    const eventSource = MockEventSource.getLatest();

    await act(async () => {
      eventSource.simulateMessage({
        status: "executing_query",
        message: "Executing...",
      });
    });

    expect(result.current.isRunning).toBe(true);

    await act(async () => {
      eventSource.simulateMessage({ status: "ready", message: "Done" });
    });

    expect(result.current.isRunning).toBe(false);
  });

  it("rate limit error (429) shows toast and resets to idle", async () => {
    server.use(
      http.post("/api/runs", () => {
        return HttpResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429 },
        );
      }),
    );

    const { result } = renderUseQueryExecution();

    await act(async () => {
      await result.current.execute("SELECT * FROM DE");
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "Too many queries running. Close a tab or wait for a query to complete.",
    );
    expect(result.current.status).toBe("idle");
    expect(result.current.isRunning).toBe(false);
  });

  it("SSE connection error shows 'Connection lost' toast but keeps current status", async () => {
    server.use(
      http.post("/api/runs", () => {
        return HttpResponse.json(
          { runId: "run-sse-error", status: "queued" },
          { status: 201 },
        );
      }),
    );

    const { result } = renderUseQueryExecution();

    await act(async () => {
      await result.current.execute("SELECT * FROM DE");
    });

    const eventSource = MockEventSource.getLatest();

    await act(async () => {
      eventSource.simulateMessage({
        status: "executing_query",
        message: "Executing...",
      });
    });

    expect(result.current.status).toBe("executing_query");

    await act(async () => {
      eventSource.simulateError();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "Connection lost. Refresh to check status.",
    );
    expect(result.current.status).toBe("executing_query");
  });

  it("on execute, runId is stored in sessionStorage", async () => {
    server.use(
      http.post("/api/runs", () => {
        return HttpResponse.json(
          { runId: "run-storage", status: "queued" },
          { status: 201 },
        );
      }),
    );

    const { result } = renderUseQueryExecution();

    await act(async () => {
      await result.current.execute("SELECT * FROM DE");
    });

    expect(mockSessionStorage.get("activeRunId")).toBe("run-storage");
  });

  it("on mount with existing sessionStorage runId, hook fetches status and reconnects", async () => {
    mockSessionStorage.set("activeRunId", "existing-run-123");

    server.use(
      http.get("/api/runs/existing-run-123", () => {
        return HttpResponse.json({
          runId: "existing-run-123",
          status: "executing_query",
        });
      }),
    );

    const { result } = renderUseQueryExecution();

    await waitFor(() => {
      expect(result.current.runId).toBe("existing-run-123");
    });

    expect(result.current.status).toBe("executing_query");

    const eventSource = MockEventSource.getLatest();
    expect(eventSource.url).toBe("/api/runs/existing-run-123/events");
  });

  it("on mount with sessionStorage runId that returns 404, clears storage and resets to idle", async () => {
    mockSessionStorage.set("activeRunId", "stale-run-404");

    server.use(
      http.get("/api/runs/stale-run-404", () => {
        return HttpResponse.json({ error: "Not found" }, { status: 404 });
      }),
    );

    const { result } = renderUseQueryExecution();

    await waitFor(() => {
      expect(mockSessionStorage.get("activeRunId")).toBeUndefined();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.runId).toBeNull();
  });

  it("clears sessionStorage on terminal state", async () => {
    server.use(
      http.post("/api/runs", () => {
        return HttpResponse.json(
          { runId: "run-clear", status: "queued" },
          { status: 201 },
        );
      }),
    );

    const { result } = renderUseQueryExecution();

    await act(async () => {
      await result.current.execute("SELECT * FROM DE");
    });

    expect(mockSessionStorage.get("activeRunId")).toBe("run-clear");

    const eventSource = MockEventSource.getLatest();

    await act(async () => {
      eventSource.simulateMessage({ status: "ready", message: "Done" });
    });

    expect(mockSessionStorage.get("activeRunId")).toBeUndefined();
  });
});
