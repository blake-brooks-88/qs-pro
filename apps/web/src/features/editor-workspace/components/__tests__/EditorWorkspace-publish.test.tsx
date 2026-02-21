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
const {
  mockToastWarning,
  mockToastSuccess,
  mockToastError,
  mockDriftRefetch,
  mockPublishMutateAsync,
  mockState,
} = vi.hoisted(() => ({
  mockToastWarning: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockDriftRefetch: vi.fn(),
  mockPublishMutateAsync: vi.fn(),
  mockState: {
    deployFeatureEnabled: true,
    teamCollabEnabled: true,
    publishIsPending: false,
    driftData: null as {
      hasDrift: boolean;
      localSql: string;
      remoteSql: string;
    } | null,
  },
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
    success: mockToastSuccess,
    warning: mockToastWarning,
    error: mockToastError,
  },
}));

vi.mock("@/hooks/use-feature", () => ({
  useFeature: (key: string) => {
    if (key === "deployToAutomation") {
      return { enabled: mockState.deployFeatureEnabled, isLoading: false };
    }
    if (key === "teamCollaboration") {
      return { enabled: mockState.teamCollabEnabled, isLoading: false };
    }
    return { enabled: true, isLoading: false };
  },
}));

vi.mock("@/components/FeatureGate", () => ({
  FeatureGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/features/editor-workspace/hooks/use-drift-check", () => ({
  useDriftCheck: () => ({
    data: mockState.driftData,
    refetch: mockDriftRefetch,
    isLoading: false,
  }),
}));

vi.mock("@/features/editor-workspace/hooks/use-publish-query", () => ({
  usePublishQuery: () => ({
    mutateAsync: mockPublishMutateAsync,
    isPending: mockState.publishIsPending,
  }),
}));

vi.mock("@/features/editor-workspace/hooks/use-blast-radius", () => ({
  useBlastRadius: () => ({
    data: { automations: [] },
    isLoading: false,
  }),
}));

vi.mock("../PublishConfirmationDialog", () => ({
  PublishConfirmationDialog: ({
    isOpen,
    onConfirm,
    onClose,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="mock-publish-confirm-dialog" role="dialog">
        <span>Publish Confirmation</span>
        <button onClick={onConfirm} data-testid="publish-confirm-btn">
          Confirm Publish
        </button>
        <button onClick={onClose} data-testid="publish-cancel-btn">
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("../DriftDetectionDialog", () => ({
  DriftDetectionDialog: ({
    isOpen,
    onKeepMine,
    onAcceptTheirs,
  }: {
    isOpen: boolean;
    onKeepMine: () => void;
    onAcceptTheirs: () => void;
  }) =>
    isOpen ? (
      <div data-testid="mock-drift-dialog" role="dialog">
        <span>Drift Detection</span>
        <button onClick={onKeepMine} data-testid="drift-keep-mine-btn">
          Keep Mine
        </button>
        <button onClick={onAcceptTheirs} data-testid="drift-accept-theirs-btn">
          Accept Theirs
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

vi.mock("@/features/editor-workspace/hooks/use-folders", () => ({
  useFolders: () => ({
    data: [
      {
        id: "shared-folder-1",
        name: "Shared Queries",
        parentId: null,
        visibility: "shared",
        userId: "u1",
        creatorName: null,
        createdAt: "2026-02-10T00:00:00.000Z",
        updatedAt: "2026-02-10T00:00:00.000Z",
      },
    ],
    isLoading: false,
  }),
  useCreateFolder: () => ({ mutate: vi.fn() }),
  useUpdateFolder: () => ({ mutate: vi.fn() }),
  useDeleteFolder: () => ({ mutate: vi.fn() }),
  useShareFolder: () => ({ mutate: vi.fn() }),
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
    data: {
      versions: [
        {
          id: "ver-1",
          savedQueryId: "sq-linked",
          sqlText: "SELECT 1",
          lineCount: 1,
          source: "save",
          restoredFromId: null,
          versionName: null,
          createdAt: "2026-02-10T00:00:00.000Z",
        },
      ],
      total: 1,
    },
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

function createLinkedProps(): Parameters<typeof EditorWorkspace>[0] {
  return {
    ...createDefaultProps(),
    savedQueries: [
      {
        id: "sq-linked",
        name: "Linked Query",
        folderId: "shared-folder-1",
        content: "SELECT 1",
        updatedAt: "2026-02-10T00:00:00.000Z",
        linkedQaCustomerKey: "qa-key-1",
        linkedQaName: "My QA",
        linkedAt: "2026-02-10T00:00:00.000Z",
      },
    ] satisfies SavedQuery[],
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
  const linkedProps = createLinkedProps();
  const result = renderWorkspace({
    ...linkedProps,
    initialTabs: [linkedTab],
  });

  // After init effect runs, the store will have the tab opened via storeOpenQuery
  // which does NOT pass linkState. Set it manually.
  const tabId = "query-sq-linked";
  useTabsStore.getState().updateTabLinkState(tabId, {
    linkedQaCustomerKey: "qa-key-1",
    linkedQaName: "My QA",
  });

  return result;
}

describe("EditorWorkspace - Publish Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.deployFeatureEnabled = true;
    mockState.teamCollabEnabled = true;
    mockState.publishIsPending = false;
    mockState.driftData = null;
    mockDriftRefetch.mockResolvedValue({ data: { hasDrift: false } });
    mockPublishMutateAsync.mockResolvedValue({});
    useTabsStore.getState().reset();
    useActivityBarStore.setState({ activeView: "dataExtensions" });
  });

  describe("publish button visibility", () => {
    it("shows publish button for saved, linked queries with deployToAutomation enabled", async () => {
      renderLinkedWorkspace();

      await waitFor(() => {
        expect(screen.getByText("Publish")).toBeInTheDocument();
      });
    });

    it("does NOT show publish button for unsaved (untitled) tabs", () => {
      renderWorkspace();

      expect(screen.queryByText("Publish")).not.toBeInTheDocument();
    });

    it("does NOT show publish button for unlinked saved queries", async () => {
      const initialTabs: QueryTab[] = [
        {
          id: "tab-1",
          queryId: "sq-unlinked",
          name: "Unlinked Query",
          content: "SELECT 1",
          isDirty: false,
          isNew: false,
        },
      ];

      renderWorkspace({ initialTabs });

      await waitFor(() => {
        expect(screen.getByText("Unlinked Query")).toBeInTheDocument();
      });
      expect(screen.queryByText("Publish")).not.toBeInTheDocument();
    });

    it("does NOT show publish button when teamCollaboration is disabled", async () => {
      mockState.teamCollabEnabled = false;
      renderLinkedWorkspace();

      await waitFor(() => {
        expect(screen.getByText("Linked Query")).toBeInTheDocument();
      });
      expect(screen.queryByText("Publish")).not.toBeInTheDocument();
    });
  });

  describe("must-save-first guard", () => {
    it("shows toast warning when Publish clicked on a dirty (unsaved changes) tab", async () => {
      const user = userEvent.setup();
      renderLinkedWorkspace();

      await waitFor(() => {
        expect(screen.getByText("Publish")).toBeInTheDocument();
      });

      const editor = screen.getByTestId("editor-textarea");
      await user.type(editor, " modified");

      const publishButton = screen.getByText("Publish");
      await user.click(publishButton);

      await waitFor(() => {
        expect(mockToastWarning).toHaveBeenCalledWith(
          "Save your changes before publishing.",
        );
      });
    });

    it("shows toast warning when Publish clicked on an untitled query tab", async () => {
      const user = userEvent.setup();
      renderLinkedWorkspace();

      // Mark the tab as isNew after render/init
      const tabId = "query-sq-linked";
      useTabsStore.setState({
        tabs: useTabsStore
          .getState()
          .tabs.map((t) => (t.id === tabId ? { ...t, isNew: true } : t)),
      });

      await waitFor(() => {
        expect(screen.getByText("Publish")).toBeInTheDocument();
      });

      const publishButton = screen.getByText("Publish");
      await user.click(publishButton);

      await waitFor(() => {
        expect(mockToastWarning).toHaveBeenCalledWith(
          "Save your query before publishing.",
        );
      });
    });
  });

  describe("publish confirmation flow", () => {
    it("opens PublishConfirmationDialog when Publish clicked on a clean, linked tab", async () => {
      const user = userEvent.setup();
      renderLinkedWorkspace();

      await waitFor(() => {
        expect(screen.getByText("Publish")).toBeInTheDocument();
      });

      const publishButton = screen.getByText("Publish");
      await user.click(publishButton);

      await waitFor(() => {
        expect(
          screen.getByTestId("mock-publish-confirm-dialog"),
        ).toBeInTheDocument();
      });
    });

    it("shows drift dialog instead of publish dialog when drift is detected", async () => {
      const user = userEvent.setup();
      mockDriftRefetch.mockResolvedValue({
        data: {
          hasDrift: true,
          localSql: "SELECT 1",
          remoteSql: "SELECT 2",
        },
      });

      renderLinkedWorkspace();

      await waitFor(() => {
        expect(screen.getByText("Publish")).toBeInTheDocument();
      });

      const publishButton = screen.getByText("Publish");
      await user.click(publishButton);

      await waitFor(() => {
        expect(screen.getByTestId("mock-drift-dialog")).toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("mock-publish-confirm-dialog"),
      ).not.toBeInTheDocument();
    });

    it("opens PublishConfirmationDialog after choosing Keep Mine in drift dialog", async () => {
      const user = userEvent.setup();
      mockDriftRefetch.mockResolvedValue({
        data: {
          hasDrift: true,
          localSql: "SELECT 1",
          remoteSql: "SELECT 2",
        },
      });

      renderLinkedWorkspace();

      await waitFor(() => {
        expect(screen.getByText("Publish")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Publish"));

      await waitFor(() => {
        expect(screen.getByTestId("mock-drift-dialog")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("drift-keep-mine-btn"));

      await waitFor(() => {
        expect(
          screen.getByTestId("mock-publish-confirm-dialog"),
        ).toBeInTheDocument();
      });
    });
  });
});
