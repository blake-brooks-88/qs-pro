import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import { server } from "@/test/mocks/server";

let thrownValue: unknown = new Error("boom");

vi.mock("@/features/editor-workspace/EditorWorkspacePage", () => ({
  EditorWorkspacePage: () => {
    throw thrownValue;
  },
}));

// Mock the SQL diagnostics hook to avoid Worker issues in tests
vi.mock(
  "@/features/editor-workspace/utils/sql-lint/use-sql-diagnostics",
  () => ({
    useSqlDiagnostics: () => [],
  }),
);

vi.mock("@/services/auth", () => ({
  getMe: vi.fn(),
  loginWithJwt: vi.fn(),
}));

import { getMe } from "@/services/auth";
import { useAuthStore } from "@/store/auth-store";

const mockGetMe = vi.mocked(getMe);

function createMockMeResponse() {
  return {
    user: {
      id: "user-1",
      sfUserId: "005xx000001234AAA",
      email: "test@example.com",
      name: "Test User",
    },
    tenant: {
      id: "tenant-1",
      eid: "100001234",
      tssd: "mcabc123.auth.marketingcloudapis.com",
    },
    csrfToken: "csrf-token-123",
  };
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

describe("App error boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.resetHandlers();

    useAuthStore.setState({
      user: null,
      tenant: null,
      csrfToken: null,
      isAuthenticated: false,
    });

    // Mock window.matchMedia (required by Sonner/Toaster)
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Sentry ErrorBoundary fallback when a child throws", async () => {
    thrownValue = new Error("boom");
    const meResponse = createMockMeResponse();
    mockGetMe.mockResolvedValue(meResponse);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try Again" }),
    ).toBeInTheDocument();
  });

  it("renders a generic message when a non-Error is thrown", async () => {
    thrownValue = "boom";
    const meResponse = createMockMeResponse();
    mockGetMe.mockResolvedValue(meResponse);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
    expect(
      screen.getByText("An unexpected error occurred"),
    ).toBeInTheDocument();
  });
});
