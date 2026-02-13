import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryExecutionStatus } from "@/features/editor-workspace/hooks/use-query-execution";
import type { RunResultsResponse } from "@/features/editor-workspace/hooks/use-run-results";
import { useActivityBarStore } from "@/features/editor-workspace/store/activity-bar-store";
import type {
  DataExtension,
  ExecutionResult,
  Folder,
  QueryTab,
  SavedQuery,
} from "@/features/editor-workspace/types";
import { useTabsStore } from "@/store/tabs-store";

import { EditorWorkspace } from "../EditorWorkspace";

// --- Hoisted mutable state for vi.mock factories ---
const { mockState, mockUnlinkMutateAsync } = vi.hoisted(() => ({
  mockState: {
    deployFeatureEnabled: true,
  },
  mockUnlinkMutateAsync: vi.fn(),
}));

// Mock Radix Tooltip to render labels inline (makes toolbar labels queryable)
vi.mock("@radix-ui/react-tooltip", () => ({
  Provider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
  Arrow: () => null,
}));

// --- Child component mocks ---
vi.mock("../MonacoQueryEditor", () => ({
  MonacoQueryEditor: ({
    onChange,
    value,
  }: {
    onChange?: (content: string) => void;
    value: string;
  }) => (
    <div data-testid="mock-editor">
      <textarea
        data-testid="editor-textarea"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  ),
}));

vi.mock("../ResultsPane", () => ({
  ResultsPane: ({ result }: { result: ExecutionResult }) => (
    <div data-testid="mock-results-pane" data-status={result.status} />
  ),
}));

vi.mock("@/components/ActivityBar", () => ({
  ActivityBar: () => <div data-testid="mock-activity-bar">ActivityBar</div>,
}));

vi.mock("../WorkspaceSidebar", () => ({
  WorkspaceSidebar: () => <div data-testid="mock-sidebar">Sidebar</div>,
}));

vi.mock("../HistoryPanel", () => ({
  HistoryPanel: () => <div data-testid="mock-history-panel">History</div>,
}));

vi.mock("../DataExtensionModal", () => ({
  DataExtensionModal: () => null,
}));

vi.mock("../QueryActivityModal", () => ({
  QueryActivityModal: () => null,
}));

vi.mock("../SaveQueryModal", () => ({
  SaveQueryModal: () => null,
}));

vi.mock("../ConfirmationDialog", () => ({
  ConfirmationDialog: () => null,
}));

vi.mock("../QueryTabBar", () => ({
  QueryTabBar: () => <div data-testid="mock-query-tab-bar">Tabs</div>,
}));

vi.mock("../../utils/schema-inferrer", () => ({
  inferSchemaFromQuery: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../utils/metadata-fetcher", () => ({
  createMetadataFetcher: vi.fn().mockReturnValue({
    getFieldsForTable: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock(
  "@/features/editor-workspace/utils/sql-lint/use-sql-diagnostics",
  () => ({
    useSqlDiagnostics: () => [],
  }),
);

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/hooks/use-feature", () => ({
  useFeature: (key: string) => {
    if (key === "deployToAutomation") {
      return { enabled: mockState.deployFeatureEnabled, isLoading: false };
    }
    return { enabled: true, isLoading: false };
  },
}));

vi.mock("@/components/FeatureGate", () => ({
  FeatureGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/features/editor-workspace/hooks/use-drift-check", () => ({
  useDriftCheck: () => ({
    data: null,
    refetch: vi.fn().mockResolvedValue({ data: { hasDrift: false } }),
    isLoading: false,
  }),
}));

vi.mock("@/features/editor-workspace/hooks/use-publish-query", () => ({
  usePublishQuery: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/features/editor-workspace/hooks/use-blast-radius", () => ({
  useBlastRadius: () => ({
    data: { automations: [] },
    isLoading: false,
  }),
}));

vi.mock("../PublishConfirmationDialog", () => ({
  PublishConfirmationDialog: () => null,
}));

vi.mock("../DriftDetectionDialog", () => ({
  DriftDetectionDialog: () => null,
}));

// Mock UnlinkModal to render a testable dialog with confirm button
vi.mock("../UnlinkModal", () => ({
  UnlinkModal: ({
    open,
    onClose,
    onUnlinkComplete,
  }: {
    open: boolean;
    onClose: () => void;
    savedQueryId: string;
    savedQueryName: string;
    linkedQaName: string;
    linkedQaCustomerKey: string;
    onUnlinkComplete: (opts: {
      deleteLocal: boolean;
      deleteRemote: boolean;
    }) => void;
  }) =>
    open ? (
      <div data-testid="mock-unlink-modal" role="dialog">
        <span>Unlink Query Activity</span>
        <button
          onClick={() =>
            onUnlinkComplete({ deleteLocal: false, deleteRemote: false })
          }
          data-testid="unlink-confirm-btn"
        >
          Confirm Unlink
        </button>
        <button onClick={onClose} data-testid="unlink-cancel-btn">
          Cancel
        </button>
      </div>
    ) : null,
}));

// --- Query execution mock ---
type MockQueryResults = {
  data: RunResultsResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

type MockQueryExecution = {
  execute: (sqlText: string, snippetName?: string) => Promise<void>;
  cancel: () => Promise<void>;
  status: QueryExecutionStatus;
  isRunning: boolean;
  runId: string | null;
  errorMessage: string | null;
  results: MockQueryResults;
  currentPage: number;
  setPage: (page: number) => void;
};

const defaultMockQueryExecution: MockQueryExecution = {
  execute: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn().mockResolvedValue(undefined),
  status: "idle",
  isRunning: false,
  runId: null,
  errorMessage: null,
  results: {
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
  },
  currentPage: 1,
  setPage: vi.fn(),
};

vi.mock("@/features/editor-workspace/hooks/use-query-execution", () => ({
  useQueryExecution: () => defaultMockQueryExecution,
}));

vi.mock("@/features/editor-workspace/hooks/use-saved-queries", () => ({
  useUpdateSavedQuery: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: "q1", name: "Query" }),
    isPending: false,
  }),
  useSavedQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
  useCreateSavedQuery: () => ({
    mutateAsync: vi
      .fn()
      .mockResolvedValue({ id: "new-q", name: "Imported Query" }),
    isPending: false,
  }),
  useSavedQueries: () => ({ data: [], isLoading: false }),
  useSavedQueryCount: () => ({ data: 0, isLoading: false }),
}));

vi.mock("@/features/editor-workspace/hooks/use-query-versions", () => ({
  versionHistoryKeys: {
    all: ["versionHistory"] as const,
    list: (savedQueryId: string) =>
      ["versionHistory", "list", savedQueryId] as const,
    detail: (savedQueryId: string, versionId: string) =>
      ["versionHistory", "detail", savedQueryId, versionId] as const,
  },
  useQueryVersions: () => ({
    data: { versions: [], total: 0 },
    isLoading: false,
  }),
  useVersionDetail: () => ({ data: undefined }),
  useRestoreVersion: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateVersionName: () => ({ mutate: vi.fn(), isPending: false }),
}));

// --- Helpers ---
function createDefaultProps(): Parameters<typeof EditorWorkspace>[0] {
  return {
    tenantId: "tenant-1",
    eid: "100001234",
    folders: [
      { id: "folder-1", name: "Queries", parentId: null, type: "library" },
    ] satisfies Folder[],
    savedQueries: [] satisfies SavedQuery[],
    dataExtensions: [] satisfies DataExtension[],
    executionResult: {
      status: "idle",
      runtime: "0ms",
      totalRows: 0,
      currentPage: 1,
      pageSize: 50,
      columns: [],
      rows: [],
    },
    isSidebarCollapsed: false,
  };
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function renderWorkspace(
  props: Partial<Parameters<typeof EditorWorkspace>[0]> = {},
) {
  const queryClient = createQueryClient();
  const mergedProps = { ...createDefaultProps(), ...props };

  return {
    ...render(<EditorWorkspace {...mergedProps} />, {
      wrapper: createWrapper(queryClient),
    }),
    props: mergedProps,
  };
}

const linkedTab: QueryTab = {
  id: "tab-linked",
  queryId: "sq-linked",
  name: "Linked Query",
  content: "SELECT 1",
  isDirty: false,
  isNew: false,
  linkedQaCustomerKey: "qa-key-1",
  linkedQaName: "My QA",
};

function renderLinkedWorkspace() {
  const result = renderWorkspace({
    initialTabs: [linkedTab],
  });

  // After init effect, manually set link state on the store tab
  const tabId = "query-sq-linked";
  useTabsStore.getState().updateTabLinkState(tabId, {
    linkedQaCustomerKey: "qa-key-1",
    linkedQaName: "My QA",
  });

  return result;
}

function findUnlinkButton(): HTMLElement {
  // Tooltip mock renders label text inline as a sibling span.
  // The button is the previous sibling element of the tooltip-content span.
  const labels = screen.getAllByText("Unlink from Query Activity");
  for (const label of labels) {
    const prevSibling = label.previousElementSibling;
    if (prevSibling?.tagName.toLowerCase() === "button") {
      return prevSibling as HTMLElement;
    }
  }
  throw new Error("Unlink button not found");
}

describe("EditorWorkspace - Unlink Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.deployFeatureEnabled = true;
    mockUnlinkMutateAsync.mockResolvedValue({});
    useTabsStore.getState().reset();
    useActivityBarStore.setState({ activeView: "dataExtensions" });
  });

  describe("unlink button visibility", () => {
    it("shows unlink button in toolbar for linked saved query tab", async () => {
      renderLinkedWorkspace();

      await waitFor(() => {
        const labels = screen.getAllByText("Unlink from Query Activity");
        expect(labels.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("hides unlink button for unlinked saved query tab", async () => {
      const unlinkedTab: QueryTab = {
        id: "tab-unlinked",
        queryId: "sq-unlinked",
        name: "Unlinked Query",
        content: "SELECT 1",
        isDirty: false,
        isNew: false,
      };

      renderWorkspace({ initialTabs: [unlinkedTab] });

      await waitFor(() => {
        expect(screen.getByText("Unlinked Query")).toBeInTheDocument();
      });

      expect(
        screen.queryByText("Unlink from Query Activity"),
      ).not.toBeInTheDocument();
    });

    it("hides unlink button when deploy feature is disabled", async () => {
      mockState.deployFeatureEnabled = false;
      renderLinkedWorkspace();

      await waitFor(() => {
        expect(screen.getByText("Linked Query")).toBeInTheDocument();
      });

      expect(
        screen.queryByText("Unlink from Query Activity"),
      ).not.toBeInTheDocument();
    });
  });

  describe("unlink flow", () => {
    it("clicking unlink button opens UnlinkModal", async () => {
      const user = userEvent.setup();
      renderLinkedWorkspace();

      await waitFor(() => {
        const labels = screen.getAllByText("Unlink from Query Activity");
        expect(labels.length).toBeGreaterThanOrEqual(1);
      });

      const button = findUnlinkButton();
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId("mock-unlink-modal")).toBeInTheDocument();
      });
    });

    it("successful unlink clears tab link state", async () => {
      const user = userEvent.setup();
      renderLinkedWorkspace();

      await waitFor(() => {
        const labels = screen.getAllByText("Unlink from Query Activity");
        expect(labels.length).toBeGreaterThanOrEqual(1);
      });

      // Verify tab is linked before unlink
      const tabBefore = useTabsStore.getState().findTabByQueryId("sq-linked");
      expect(tabBefore?.linkedQaCustomerKey).toBe("qa-key-1");

      // Click unlink button to open modal
      const button = findUnlinkButton();
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByTestId("mock-unlink-modal")).toBeInTheDocument();
      });

      // Click confirm in mock modal (triggers onUnlinkComplete with deleteLocal: false)
      await user.click(screen.getByTestId("unlink-confirm-btn"));

      // Tab link state should be cleared
      await waitFor(() => {
        const tabAfter = useTabsStore.getState().findTabByQueryId("sq-linked");
        expect(tabAfter?.linkedQaCustomerKey).toBeNull();
        expect(tabAfter?.linkedQaName).toBeNull();
      });
    });
  });
});
