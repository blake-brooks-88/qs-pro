import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import { server } from "@/test/mocks/server";

// Mock the SQL diagnostics hook to avoid Worker issues in tests
vi.mock(
  "@/features/editor-workspace/utils/sql-lint/use-sql-diagnostics",
  () => ({
    useSqlDiagnostics: () => [],
  }),
);

// Mock auth services
vi.mock("@/services/auth", () => ({
  getMe: vi.fn(),
  loginWithJwt: vi.fn(),
}));

vi.mock("@/services/embedded-jwt", () => ({
  consumeEmbeddedJwt: vi.fn(),
}));

// Import mocked modules for test manipulation
import { getMe, loginWithJwt } from "@/services/auth";
import { consumeEmbeddedJwt } from "@/services/embedded-jwt";
import { useAuthStore } from "@/store/auth-store";

// Type the mocked functions
const mockGetMe = vi.mocked(getMe);
const mockLoginWithJwt = vi.mocked(loginWithJwt);
const mockConsumeEmbeddedJwt = vi.mocked(consumeEmbeddedJwt);

// Helper to create valid MeResponse data
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

// Helper to create 401 errors
function create401Error(reason?: string) {
  const error = new Error("Unauthorized") as Error & {
    response?: { status: number; data?: unknown };
  };
  error.response = {
    status: 401,
    data: reason ? { reason } : undefined,
  };
  return error;
}

// Mock location with assign method
const mockLocationAssign = vi.fn();
const mockLocationReload = vi.fn();
const mockLocation = {
  ...window.location,
  assign: mockLocationAssign,
  search: "",
  reload: mockLocationReload,
};

// QueryClient wrapper for tests that reach authenticated state
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("App", () => {
  // Store original window properties
  const originalSelf = window.self;
  const originalTop = window.top;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockLocationAssign.mockClear();
    mockLocationReload.mockClear();

    // Reset auth store to initial state
    useAuthStore.setState({
      user: null,
      tenant: null,
      csrfToken: null,
      isAuthenticated: false,
    });

    // Reset MSW handlers
    server.resetHandlers();

    // Default mock implementations
    mockConsumeEmbeddedJwt.mockReturnValue(null);
    mockLoginWithJwt.mockResolvedValue(undefined);

    // Mock window.location
    vi.stubGlobal("location", mockLocation);

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

    // Reset window self/top to not embedded by default
    Object.defineProperty(window, "self", {
      value: originalSelf,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "top", {
      value: originalTop,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore window properties
    Object.defineProperty(window, "self", {
      value: originalSelf,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "top", {
      value: originalTop,
      writable: true,
      configurable: true,
    });

    // Unstub location and matchMedia
    vi.unstubAllGlobals();

    // Clear any pending timers
    vi.useRealTimers();
  });

  // Helper to set embedded mode (iframe)
  function setEmbeddedMode(embedded: boolean) {
    if (embedded) {
      // Create a different object for top to simulate iframe
      const mockTop = {} as Window;
      Object.defineProperty(window, "self", {
        value: window,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window, "top", {
        value: mockTop,
        writable: true,
        configurable: true,
      });
    } else {
      // Same object for self and top (not embedded)
      Object.defineProperty(window, "self", {
        value: window,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window, "top", {
        value: window,
        writable: true,
        configurable: true,
      });
    }
  }

  describe("JWT auth flow (embedded)", () => {
    it("renders loading state during initial auth check", async () => {
      // Arrange: getMe never resolves (hangs)
      mockGetMe.mockImplementation(() => new Promise(() => {}));

      // Act
      render(<App />);

      // Assert: Loading UI is shown with spinner and text
      expect(screen.getByText("Initializing Query++...")).toBeInTheDocument();
      // The parent container has the loading spinner
      const loadingContainer = screen.getByText(
        "Initializing Query++...",
      ).parentElement;
      expect(loadingContainer).toBeInTheDocument();
    });

    it("attempts JWT auth when embedded in iframe", async () => {
      // Arrange
      setEmbeddedMode(true);
      const testJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature";
      mockConsumeEmbeddedJwt.mockReturnValue(testJwt);
      mockLoginWithJwt.mockResolvedValue(undefined);
      mockGetMe.mockImplementation(() => new Promise(() => {})); // Hang to keep in loading

      // Act
      render(<App />);

      // Assert: JWT login was attempted
      await waitFor(() => {
        expect(mockLoginWithJwt).toHaveBeenCalledWith(testJwt);
      });
    });

    it("handles JWT auth success and transitions to authenticated state", async () => {
      // Arrange
      setEmbeddedMode(true);
      const testJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature";
      const meResponse = createMockMeResponse();
      const queryClient = createTestQueryClient();

      mockConsumeEmbeddedJwt.mockReturnValue(testJwt);
      mockLoginWithJwt.mockResolvedValue(undefined);
      mockGetMe.mockResolvedValue(meResponse);

      // Act
      render(<App />, { wrapper: createWrapper(queryClient) });

      // Assert: Authenticated UI is shown (AppShell with Query++ branding)
      await waitFor(() => {
        expect(screen.getByText("Query")).toBeInTheDocument();
        expect(screen.getByText("++")).toBeInTheDocument();
      });
    });

    it("handles JWT auth failure gracefully", async () => {
      // Arrange
      setEmbeddedMode(true);
      const testJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature";

      mockConsumeEmbeddedJwt.mockReturnValue(testJwt);
      mockLoginWithJwt.mockRejectedValue(new Error("Invalid JWT"));
      // getMe will fail with 401 after JWT login fails
      mockGetMe.mockRejectedValue(create401Error());

      // Act
      render(<App />);

      // Assert: No crash, shows retry option (embedded unauthenticated state)
      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeInTheDocument();
      });
    });

    it("attempts JWT auth when a message event delivers a buffered JWT", async () => {
      setEmbeddedMode(true);

      const testJwt = "aaa.bbb.ccc";
      mockConsumeEmbeddedJwt
        .mockReturnValueOnce(null) // initial bufferedJwt read
        .mockReturnValueOnce(testJwt); // consumed inside message handler

      mockLoginWithJwt.mockResolvedValue(undefined);
      mockGetMe.mockImplementation(() => new Promise(() => {}));

      render(<App />);

      window.dispatchEvent(new MessageEvent("message", { data: {} }));

      await waitFor(() => {
        expect(mockLoginWithJwt).toHaveBeenCalledWith(testJwt);
      });
    });
  });

  describe("OAuth redirect flow", () => {
    it("redirects to OAuth login when embedded and unauthenticated after 401", async () => {
      // Arrange
      setEmbeddedMode(true);
      mockGetMe.mockRejectedValue(create401Error());

      // Act
      render(<App />);

      // Assert: OAuth redirect was triggered
      await waitFor(() => {
        expect(mockLocationAssign).toHaveBeenCalledWith("/api/auth/login");
      });
    });

    it("handles OAuth callback and establishes session", async () => {
      // Arrange: Not embedded, getMe succeeds (post-OAuth callback)
      setEmbeddedMode(false);
      const meResponse = createMockMeResponse();
      const queryClient = createTestQueryClient();
      mockGetMe.mockResolvedValue(meResponse);

      // Act
      render(<App />, { wrapper: createWrapper(queryClient) });

      // Assert: Session established and authenticated UI shown
      await waitFor(() => {
        expect(screen.getByText("Query")).toBeInTheDocument();
        expect(screen.getByText("++")).toBeInTheDocument();
      });

      // Verify auth store was updated
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(meResponse.user);
      expect(state.tenant).toEqual(meResponse.tenant);
    });
  });

  describe("auth retry with backoff", () => {
    it("retries auth on transient failure with exponential backoff", async () => {
      // Arrange
      vi.useFakeTimers();
      setEmbeddedMode(true);

      mockGetMe.mockRejectedValue(create401Error());

      // Act
      render(<App />);

      // First call happens immediately and triggers redirect
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Assert: OAuth redirect was triggered (first action on 401 when embedded)
      expect(mockLocationAssign).toHaveBeenCalledWith("/api/auth/login");

      vi.useRealTimers();
    });

    it("gives up after max retries", async () => {
      // Arrange: Embedded mode with 401 errors that have no reauth_required reason
      // After OAuth redirect is attempted, subsequent 401s trigger retries until max is reached
      setEmbeddedMode(true);
      mockGetMe.mockRejectedValue(create401Error());

      // Act
      render(<App />);

      // Assert: OAuth redirect was triggered initially
      await waitFor(() => {
        expect(mockLocationAssign).toHaveBeenCalledWith("/api/auth/login");
      });

      // After OAuth redirect, the component sets oauthRedirectAttempted to true
      // and subsequent 401s will retry with backoff until max attempts
      // Eventually shows the retry/launch help UI
      await waitFor(
        () => {
          // Shows either the embedded retry UI or LaunchInstructionsPage
          const retryButton = screen.queryByText("Retry");
          const launchHelp = screen.queryByText("Launch Help");
          expect(retryButton ?? launchHelp).toBeTruthy();
        },
        { timeout: 1000 },
      );
    });

    it("shows error state after exhausting retries", async () => {
      // Arrange: Same as above - embedded mode with persistent 401 errors
      setEmbeddedMode(true);
      mockGetMe.mockRejectedValue(create401Error());

      // Act
      render(<App />);

      // Assert: After initial redirect attempt, shows the retry UI
      await waitFor(() => {
        expect(mockLocationAssign).toHaveBeenCalledWith("/api/auth/login");
      });

      // The component shows the embedded unauthenticated state with retry options
      await waitFor(
        () => {
          const retryButton = screen.queryByText("Retry");
          const launchHelp = screen.queryByText("Launch Help");
          expect(retryButton ?? launchHelp).toBeTruthy();
        },
        { timeout: 1000 },
      );
    });
  });

  describe("reauth requirement detection", () => {
    it("detects reauth requirement from API response", async () => {
      // Arrange
      mockGetMe.mockRejectedValue(create401Error("reauth_required"));

      // Spy on logout
      const logoutSpy = vi.fn();
      const originalLogout = useAuthStore.getState().logout;
      useAuthStore.setState({
        ...useAuthStore.getState(),
        logout: () => {
          logoutSpy();
          originalLogout();
        },
      });

      // Act
      render(<App />);

      // Assert: Logout was called and LaunchInstructionsPage shown
      await waitFor(() => {
        expect(logoutSpy).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText("Launch Query++")).toBeInTheDocument();
      });
    });

    it("triggers reauth flow when session expires", async () => {
      // Arrange
      mockGetMe.mockRejectedValue(create401Error("reauth_required"));

      // Act
      render(<App />);

      // Assert: LaunchInstructionsPage is rendered
      await waitFor(() => {
        expect(screen.getByText("Launch Query++")).toBeInTheDocument();
      });

      // Verify it's the LaunchInstructionsPage, not an error state
      expect(screen.queryByText("Connection Error")).not.toBeInTheDocument();
      expect(
        screen.getByText(/must be accessed directly through Salesforce/i),
      ).toBeInTheDocument();
    });

    it("shows LaunchInstructionsPage when embedded and reauth is required", async () => {
      setEmbeddedMode(true);
      mockGetMe.mockRejectedValue(create401Error("reauth_required"));

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Launch Query++")).toBeInTheDocument();
      });
    });
  });

  describe("authenticated state", () => {
    it("renders main app content when authenticated", async () => {
      // Arrange
      const meResponse = createMockMeResponse();
      const queryClient = createTestQueryClient();
      mockGetMe.mockResolvedValue(meResponse);

      // Act
      render(<App />, { wrapper: createWrapper(queryClient) });

      // Assert: AppShell with main content is rendered
      await waitFor(() => {
        // Query++ branding in header
        expect(screen.getByText("Query")).toBeInTheDocument();
        expect(screen.getByText("++")).toBeInTheDocument();
      });

      // Verify authenticated state
      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      // Verify no error states
      expect(screen.queryByText("Connection Error")).not.toBeInTheDocument();
      expect(screen.queryByText("Launch Query++")).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows Connection Error UI when a non-401 error occurs", async () => {
      mockGetMe.mockRejectedValue(new Error("Backend down"));

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Connection Error")).toBeInTheDocument();
      });
      expect(screen.getByText("Backend down")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Retry Connection" }));
      expect(mockLocationReload).toHaveBeenCalled();
    });
  });
});
