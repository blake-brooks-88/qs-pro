import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryExecutionStatus } from "@/features/editor-workspace/hooks/use-query-execution";
import type { RunResultsResponse } from "@/features/editor-workspace/hooks/use-run-results";
import { useActivityBarStore } from "@/features/editor-workspace/store/activity-bar-store";
import type {
  DataExtension,
  ExecutionResult,
  Folder,
  SavedQuery,
} from "@/features/editor-workspace/types";
import { useTabsStore } from "@/store/tabs-store";
import { server } from "@/test/mocks/server";

import { EditorWorkspace } from "../EditorWorkspace";

// --- Hoisted mutable state for vi.mock factories ---
const { mockState } = vi.hoisted(() => ({
  mockState: {
    deployFeatureEnabled: true,
  },
}));

// Mock Radix Tooltip to be completely transparent (no portal, render all inline)
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

describe("EditorWorkspace - Import Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.deployFeatureEnabled = true;
    useTabsStore.getState().reset();
    useActivityBarStore.setState({ activeView: "dataExtensions" });

    server.use(
      http.get("/api/query-activities", () => {
        return HttpResponse.json([
          {
            objectId: "qa-obj-1",
            customerKey: "qa-key-1",
            name: "Weekly Subscribers",
            targetUpdateType: "Overwrite",
            targetDEName: "Subscriber_Weekly",
            modifiedDate: "2026-02-01T10:00:00Z",
            status: "Active",
            isLinked: false,
            linkedToQueryName: null,
          },
        ]);
      }),
      http.get("/api/query-activities/:customerKey", () => {
        return HttpResponse.json({
          objectId: "qa-obj-1",
          customerKey: "qa-key-1",
          name: "Weekly Subscribers",
          queryText: "SELECT SubscriberKey FROM [_Subscribers]",
          targetUpdateType: "Overwrite",
          isLinked: false,
          linkedToQueryName: null,
        });
      }),
      http.post("/api/saved-queries", () => {
        return HttpResponse.json({
          id: "imported-sq-1",
          name: "Weekly Subscribers",
          sqlText: "SELECT SubscriberKey FROM [_Subscribers]",
          folderId: null,
        });
      }),
    );
  });

  function findImportButton(): HTMLElement {
    // Tooltip mock renders label text inline as a sibling span.
    // The button is the previous sibling element of the tooltip-content span.
    const labels = screen.getAllByText("Import from Automation Studio");
    for (const label of labels) {
      const prevSibling = label.previousElementSibling;
      if (prevSibling?.tagName.toLowerCase() === "button") {
        return prevSibling as HTMLElement;
      }
    }
    throw new Error("Import button not found");
  }

  it("import button visible when deployToAutomation enabled", () => {
    renderWorkspace();

    const labels = screen.getAllByText("Import from Automation Studio");
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it("import button hidden when deployToAutomation disabled", () => {
    mockState.deployFeatureEnabled = false;
    renderWorkspace();

    expect(
      screen.queryByText("Import from Automation Studio"),
    ).not.toBeInTheDocument();
  });

  it("clicking import button opens ImportQueryModal", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const button = findImportButton();
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("'Open in Editor' creates new untitled tab with QA SQL", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const button = findImportButton();
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Open in Editor")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Open in Editor"));

    // Modal dialog should close
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Verify the tab store has the new tab with SQL content
    const tabs = useTabsStore.getState().tabs;
    const importedTab = tabs.find(
      (t) => t.content === "SELECT SubscriberKey FROM [_Subscribers]",
    );
    expect(importedTab).toBeTruthy();
    expect(importedTab?.queryId).toBeUndefined();
  });

  it("'Import as Saved Query' opens saved query tab", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const importButton = findImportButton();
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Import as Saved Query")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Import as Saved Query"));

    await waitFor(() => {
      expect(screen.getByText("Configure Import")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^import$/i }));

    // Modal dialog should close
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Verify the tab store has the saved query tab
    // The useCreateSavedQuery mock returns { id: "new-q", name: "Imported Query" }
    const tabs = useTabsStore.getState().tabs;
    const savedTab = tabs.find((t) => t.queryId === "new-q");
    expect(savedTab).toBeTruthy();
    expect(savedTab?.name).toBe("Imported Query");
  });

  it("import button accessible from untitled tab", () => {
    renderWorkspace();

    // Default state = untitled tab (no queryId on active tab)
    const activeTab = useTabsStore.getState().getActiveTab();
    expect(activeTab?.queryId).toBeUndefined();

    const labels = screen.getAllByText("Import from Automation Studio");
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });
});
