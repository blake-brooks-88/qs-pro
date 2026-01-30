import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryExecutionStatus } from "@/features/editor-workspace/hooks/use-query-execution";
import type { RunResultsResponse } from "@/features/editor-workspace/hooks/use-run-results";
import type {
  DataExtension,
  ExecutionResult,
  Folder,
  QueryTab,
  SavedQuery,
} from "@/features/editor-workspace/types";

import { EditorWorkspace } from "../EditorWorkspace";

// Mock child components to isolate EditorWorkspace tests
vi.mock("../MonacoQueryEditor", () => ({
  MonacoQueryEditor: ({
    onChange,
    onSave,
    onSaveAs,
    onRunRequest,
    value,
  }: {
    onChange?: (content: string) => void;
    onSave?: () => void;
    onSaveAs?: () => void;
    onRunRequest?: () => void;
    value: string;
  }) => (
    <div data-testid="mock-editor">
      <textarea
        data-testid="editor-textarea"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSave?.();
          }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onRunRequest?.();
          }
        }}
      />
      <button onClick={onSaveAs} data-testid="editor-save-as-button">
        Save As
      </button>
    </div>
  ),
}));

vi.mock("../ResultsPane", () => ({
  ResultsPane: ({
    result,
    onCancel,
  }: {
    result: ExecutionResult;
    onCancel?: () => void;
  }) => (
    <div data-testid="mock-results-pane" data-status={result.status}>
      {result.errorMessage ? (
        <span data-testid="error-message">{result.errorMessage}</span>
      ) : null}
      {result.status === "running" && (
        <button onClick={onCancel} data-testid="cancel-button">
          Cancel
        </button>
      )}
      {result.rows.length > 0 && (
        <span data-testid="row-count">{result.rows.length} rows</span>
      )}
    </div>
  ),
}));

vi.mock("../WorkspaceSidebar", () => ({
  WorkspaceSidebar: ({
    isCollapsed,
    onToggle,
    onSelectQuery,
  }: {
    isCollapsed: boolean;
    onToggle?: () => void;
    onSelectQuery?: (id: string) => void;
  }) => (
    <div data-testid="mock-sidebar" data-collapsed={isCollapsed}>
      <button onClick={onToggle} data-testid="sidebar-toggle">
        {isCollapsed ? "Expand" : "Collapse"} Sidebar
      </button>
      <button
        onClick={() => onSelectQuery?.("test-query-id")}
        data-testid="sidebar-select-query"
      >
        Select Query
      </button>
    </div>
  ),
}));

vi.mock("../DataExtensionModal", () => ({
  DataExtensionModal: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="mock-de-modal" role="dialog">
        <h2>Create Data Extension</h2>
        <button onClick={onClose} data-testid="de-modal-close">
          Close
        </button>
      </div>
    ) : null,
}));

vi.mock("../QueryActivityModal", () => ({
  QueryActivityModal: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="mock-qa-modal" role="dialog">
        <h2>Deploy to Automation</h2>
        <button onClick={onClose} data-testid="qa-modal-close">
          Close
        </button>
      </div>
    ) : null,
}));

vi.mock("../SaveQueryModal", () => ({
  SaveQueryModal: ({
    isOpen,
    initialName,
    onClose,
    onSaveSuccess,
    onSave,
  }: {
    isOpen: boolean;
    content: string;
    initialName?: string;
    onClose: () => void;
    onSaveSuccess?: (queryId: string, name: string) => void;
    onSave?: (name: string, folderId: string) => void;
  }) =>
    isOpen ? (
      <div data-testid="mock-save-modal" role="dialog">
        <h2>Save Query</h2>
        <span data-testid="save-modal-initial-name">{initialName}</span>
        <button onClick={onClose} data-testid="save-modal-cancel">
          Cancel
        </button>
        <button
          onClick={() => {
            onSaveSuccess?.("new-query-id", initialName ?? "Test Query");
            onSave?.(initialName ?? "Test Query", "folder-1");
          }}
          data-testid="save-modal-confirm"
        >
          Save
        </button>
      </div>
    ) : null,
}));

vi.mock("../ConfirmationDialog", () => ({
  ConfirmationDialog: ({
    isOpen,
    title,
    onClose,
    onConfirm,
    confirmLabel,
  }: {
    isOpen: boolean;
    title: string;
    onClose: () => void;
    onConfirm: () => void;
    confirmLabel?: string;
  }) =>
    isOpen ? (
      <div data-testid="mock-confirmation-dialog" role="alertdialog">
        <h2 data-testid="confirmation-title">{title}</h2>
        <button onClick={onClose} data-testid="confirmation-cancel">
          Cancel
        </button>
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          data-testid="confirmation-confirm"
        >
          {confirmLabel ?? "Confirm"}
        </button>
      </div>
    ) : null,
}));

// Mock QueryTabBar to make tab counting reliable in tests
// The real QueryTabBar reads from Zustand store which complicates testing
vi.mock("../QueryTabBar", () => ({
  QueryTabBar: () => (
    <div data-testid="mock-query-tab-bar">
      <span>Query Tabs</span>
    </div>
  ),
}));

// Mock FeatureGate to always render children
vi.mock("@/components/FeatureGate", () => ({
  FeatureGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Mock hooks
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

const mockExecute = vi.fn<MockQueryExecution["execute"]>().mockResolvedValue();
const mockCancel = vi.fn<MockQueryExecution["cancel"]>().mockResolvedValue();
const mockSetPage = vi.fn<MockQueryExecution["setPage"]>();

const defaultMockQueryExecution: MockQueryExecution = {
  execute: mockExecute,
  cancel: mockCancel,
  status: "idle",
  isRunning: false,
  runId: null,
  errorMessage: null,
  results: {
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn<MockQueryResults["refetch"]>().mockResolvedValue(undefined),
  },
  currentPage: 1,
  setPage: mockSetPage,
};

let mockQueryExecutionReturn: MockQueryExecution = {
  ...defaultMockQueryExecution,
};

vi.mock("@/features/editor-workspace/hooks/use-query-execution", () => ({
  useQueryExecution: () => mockQueryExecutionReturn,
}));

// Mock for useSavedQuery lazy loading - mutable so tests can control it
let mockSavedQueryData: {
  id: string;
  name: string;
  sqlText: string;
  folderId: string | null;
} | null = null;

vi.mock("@/features/editor-workspace/hooks/use-saved-queries", () => ({
  useUpdateSavedQuery: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: "q1", name: "Updated Query" }),
    isPending: false,
  }),
  useSavedQuery: (id: string | undefined) => ({
    data: id && mockSavedQueryData?.id === id ? mockSavedQueryData : undefined,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock(
  "@/features/editor-workspace/utils/sql-lint/use-sql-diagnostics",
  () => ({
    useSqlDiagnostics: () => [],
  }),
);

// Helper functions
function createDefaultProps(): Parameters<typeof EditorWorkspace>[0] {
  return {
    tenantId: "tenant-1",
    eid: "100001234",
    folders: [
      { id: "folder-1", name: "My Queries", parentId: null, type: "library" },
    ] satisfies Folder[],
    savedQueries: [] satisfies SavedQuery[],
    dataExtensions: [] satisfies DataExtension[],
    executionResult: createMockExecutionResult(),
    isSidebarCollapsed: false,
  };
}

function createMockExecutionResult(
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult {
  return {
    status: "idle",
    runtime: "0ms",
    totalRows: 0,
    currentPage: 1,
    pageSize: 50,
    columns: [],
    rows: [],
    ...overrides,
  };
}

function createQueryClient(): QueryClient {
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

function renderEditorWorkspace(
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

// Helper to find the tab group containers in the tab rail
function getTabGroups(): HTMLElement[] {
  // Tab groups are .group divs inside the tab rail overflow container
  return Array.from(document.querySelectorAll(".group.relative"));
}

// Helper to find close button within a tab group
function getCloseButtonInGroup(group: HTMLElement): HTMLElement | null {
  const buttons = within(group).getAllByRole("button");
  // Close button is the one with opacity-0 class (hidden until hover)
  return buttons.find((btn) => btn.classList.contains("opacity-0")) ?? null;
}

describe("EditorWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryExecutionReturn = { ...defaultMockQueryExecution };
    mockSavedQueryData = null;
  });

  describe("tab lifecycle", () => {
    it("creates new tab when New Tab button clicked", async () => {
      const user = userEvent.setup();
      const onNewTab = vi.fn();
      renderEditorWorkspace({ onNewTab });

      // Find the "New Tab" button - it's in the tab rail with specific styling
      const tabRailButtons = screen.getAllByRole("button");
      const newTabButton = tabRailButtons.find(
        (btn) =>
          btn.classList.contains("text-primary") &&
          btn.classList.contains("hover:bg-primary/10"),
      );

      expect(newTabButton).not.toBeUndefined();
      await user.click(newTabButton as HTMLElement);

      // onNewTab callback should be called
      await waitFor(() => {
        expect(onNewTab).toHaveBeenCalled();
      });
    });

    it("closes tab when close button clicked", async () => {
      const user = userEvent.setup();
      const onTabClose = vi.fn();

      const initialTabs: QueryTab[] = [
        { id: "tab-1", name: "Query 1", content: "", isDirty: false },
        { id: "tab-2", name: "Query 2", content: "", isDirty: false },
      ];

      renderEditorWorkspace({ initialTabs, onTabClose });

      // Get tab groups - should have 2 tabs
      const tabGroups = getTabGroups();
      expect(tabGroups.length).toBe(2);

      // Find close button on second tab and click it
      const closeButton = getCloseButtonInGroup(tabGroups[1] as HTMLElement);
      expect(closeButton).not.toBeNull();
      await user.click(closeButton as HTMLElement);

      await waitFor(() => {
        expect(onTabClose).toHaveBeenCalledWith("tab-2");
      });
    });

    it("switches active tab when tab header clicked", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();

      const initialTabs: QueryTab[] = [
        { id: "tab-1", name: "Query 1", content: "SELECT 1", isDirty: false },
        { id: "tab-2", name: "Query 2", content: "SELECT 2", isDirty: false },
      ];

      renderEditorWorkspace({ initialTabs, onTabChange });

      // Get tab groups
      const tabGroups = getTabGroups();
      expect(tabGroups.length).toBe(2);

      // Find the main button (not close button) in second tab group
      const tab2Buttons = within(tabGroups[1] as HTMLElement).getAllByRole(
        "button",
      );
      const tab2Button = tab2Buttons.find(
        (btn) => !btn.classList.contains("opacity-0"),
      );

      expect(tab2Button).not.toBeUndefined();

      // First tab should be active initially
      const tab1Buttons = within(tabGroups[0] as HTMLElement).getAllByRole(
        "button",
      );
      const tab1Button = tab1Buttons.find(
        (btn) => !btn.classList.contains("opacity-0"),
      );
      expect(tab1Button).toHaveClass("bg-primary");

      // Click on second tab
      await user.click(tab2Button as HTMLElement);

      // Second tab should now be active
      await waitFor(() => {
        expect(tab2Button).toHaveClass("bg-primary");
        expect(onTabChange).toHaveBeenCalledWith("tab-2");
      });
    });

    it("prompts for save when closing dirty tab", async () => {
      const user = userEvent.setup();

      const initialTabs: QueryTab[] = [
        { id: "tab-1", name: "Query 1", content: "", isDirty: false },
      ];

      renderEditorWorkspace({ initialTabs });

      // Type in editor to make tab dirty
      const editor = screen.getByTestId("editor-textarea");
      await user.type(editor, "SELECT * FROM Test");

      // Get tab group and close button
      const tabGroups = getTabGroups();
      const closeButton = getCloseButtonInGroup(tabGroups[0] as HTMLElement);

      expect(closeButton).not.toBeNull();
      await user.click(closeButton as HTMLElement);

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(
          screen.getByTestId("mock-confirmation-dialog"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("confirmation-title")).toHaveTextContent(
          /unsaved changes/i,
        );
      });
    });

    it("allows close without save when user confirms discard", async () => {
      const user = userEvent.setup();
      const onTabClose = vi.fn();

      const initialTabs: QueryTab[] = [
        { id: "tab-1", name: "Query 1", content: "", isDirty: false },
        { id: "tab-2", name: "Query 2", content: "", isDirty: false },
      ];

      renderEditorWorkspace({ initialTabs, onTabClose });

      // Make first tab dirty
      const editor = screen.getByTestId("editor-textarea");
      await user.type(editor, "SELECT * FROM Test");

      // Get tab group and close button
      const tabGroups = getTabGroups();
      const closeButton = getCloseButtonInGroup(tabGroups[0] as HTMLElement);

      expect(closeButton).not.toBeNull();
      await user.click(closeButton as HTMLElement);

      // Wait for dialog
      await waitFor(() => {
        expect(
          screen.getByTestId("mock-confirmation-dialog"),
        ).toBeInTheDocument();
      });

      // Confirm discard
      await user.click(screen.getByTestId("confirmation-confirm"));

      // Tab should be closed
      await waitFor(() => {
        expect(onTabClose).toHaveBeenCalledWith("tab-1");
      });
    });

    it("cancels close when user cancels discard prompt", async () => {
      const user = userEvent.setup();
      const onTabClose = vi.fn();

      const initialTabs: QueryTab[] = [
        { id: "tab-1", name: "Query 1", content: "", isDirty: false },
      ];

      renderEditorWorkspace({ initialTabs, onTabClose });

      // Make tab dirty
      const editor = screen.getByTestId("editor-textarea");
      await user.type(editor, "SELECT * FROM Test");

      // Get tab group and close button
      const tabGroups = getTabGroups();
      const closeButton = getCloseButtonInGroup(tabGroups[0] as HTMLElement);

      expect(closeButton).not.toBeNull();
      await user.click(closeButton as HTMLElement);

      // Wait for dialog
      await waitFor(() => {
        expect(
          screen.getByTestId("mock-confirmation-dialog"),
        ).toBeInTheDocument();
      });

      // Cancel the close
      await user.click(screen.getByTestId("confirmation-cancel"));

      // Tab should still exist, onTabClose not called
      await waitFor(() => {
        expect(
          screen.queryByTestId("mock-confirmation-dialog"),
        ).not.toBeInTheDocument();
      });
      expect(onTabClose).not.toHaveBeenCalled();
      // Verify tab group still exists
      expect(getTabGroups().length).toBe(1);
    });
  });

  describe("modal handling", () => {
    // Helper to get toolbar buttons in the icon toolbar area
    function getToolbarIconButtons(): HTMLElement[] {
      // The toolbar icon buttons are in div.flex.items-center.gap-1
      const toolbarSection = document.querySelector(
        ".flex.items-center.gap-1.overflow-visible",
      );
      if (!toolbarSection) {
        return [];
      }
      return Array.from(toolbarSection.querySelectorAll("button"));
    }

    it("opens SaveQueryModal when save triggered on new query", async () => {
      const user = userEvent.setup();

      // Default tabs are isNew: true
      renderEditorWorkspace();

      // First button in toolbar icons is the save button (Diskette icon)
      const toolbarButtons = getToolbarIconButtons();
      expect(toolbarButtons.length).toBeGreaterThan(0);

      const saveButton = toolbarButtons.at(0);
      expect(saveButton).toBeDefined();
      await user.click(saveButton as HTMLElement);

      // SaveQueryModal should open
      await waitFor(() => {
        expect(screen.getByTestId("mock-save-modal")).toBeInTheDocument();
      });
    });

    it("saves existing query without modal when save triggered", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();

      const initialTabs: QueryTab[] = [
        {
          id: "tab-1",
          queryId: "q1", // Must have queryId for auto-save to work
          name: "Existing Query",
          content: "SELECT 1",
          isDirty: true,
          isNew: false,
        },
      ];

      renderEditorWorkspace({ initialTabs, onSave });

      // First button in toolbar icons is the save button
      const toolbarButtons = getToolbarIconButtons();
      const saveButton = toolbarButtons.at(0);
      expect(saveButton).toBeDefined();

      await user.click(saveButton as HTMLElement);

      // Should call onSave after API mutation completes, not open modal
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith("tab-1", "SELECT 1");
      });
      expect(screen.queryByTestId("mock-save-modal")).not.toBeInTheDocument();
    });

    it("closes SaveQueryModal on cancel", async () => {
      const user = userEvent.setup();
      renderEditorWorkspace();

      // Open save modal
      const toolbarButtons = getToolbarIconButtons();
      const saveButton = toolbarButtons.at(0);
      expect(saveButton).toBeDefined();
      await user.click(saveButton as HTMLElement);

      await waitFor(() => {
        expect(screen.getByTestId("mock-save-modal")).toBeInTheDocument();
      });

      // Click cancel
      await user.click(screen.getByTestId("save-modal-cancel"));

      // Modal should close
      await waitFor(() => {
        expect(screen.queryByTestId("mock-save-modal")).not.toBeInTheDocument();
      });
    });

    it("saves query and closes modal on confirm", async () => {
      const user = userEvent.setup();
      const onSaveAs = vi.fn();

      renderEditorWorkspace({ onSaveAs });

      // Open save modal
      const toolbarButtons = getToolbarIconButtons();
      const saveButton = toolbarButtons.at(0);
      expect(saveButton).toBeDefined();
      await user.click(saveButton as HTMLElement);

      await waitFor(() => {
        expect(screen.getByTestId("mock-save-modal")).toBeInTheDocument();
      });

      // Confirm save
      await user.click(screen.getByTestId("save-modal-confirm"));

      // onSaveAs should be called and modal closed
      await waitFor(() => {
        expect(onSaveAs).toHaveBeenCalled();
        expect(screen.queryByTestId("mock-save-modal")).not.toBeInTheDocument();
      });
    });

    it("opens DataExtensionModal when DE action triggered", async () => {
      const user = userEvent.setup();
      renderEditorWorkspace();

      // DE button is the 4th button in toolbar icons (after save, format, export)
      const toolbarButtons = getToolbarIconButtons();
      // Buttons: 0=Save, 1=Format, 2=Export, 3=Create DE
      const deButton = toolbarButtons.at(3);
      expect(deButton).toBeDefined();
      await user.click(deButton as HTMLElement);

      // Modal should open
      await waitFor(() => {
        expect(screen.getByTestId("mock-de-modal")).toBeInTheDocument();
      });
    });

    it("opens QueryActivityModal when activity action triggered", async () => {
      const user = userEvent.setup();
      renderEditorWorkspace();

      // Find and click Deploy to Automation button - has specific text
      const deployButton = screen.getByRole("button", {
        name: /deploy to automation/i,
      });
      await user.click(deployButton);

      // Modal should open
      await waitFor(() => {
        expect(screen.getByTestId("mock-qa-modal")).toBeInTheDocument();
      });
    });

    it("closes modals via close button", async () => {
      const user = userEvent.setup();
      renderEditorWorkspace();

      // DE button is the 4th button in toolbar icons
      const toolbarButtons = getToolbarIconButtons();
      const deButton = toolbarButtons.at(3);
      expect(deButton).toBeDefined();
      await user.click(deButton as HTMLElement);

      await waitFor(() => {
        expect(screen.getByTestId("mock-de-modal")).toBeInTheDocument();
      });

      // Close via button
      await user.click(screen.getByTestId("de-modal-close"));

      await waitFor(() => {
        expect(screen.queryByTestId("mock-de-modal")).not.toBeInTheDocument();
      });
    });
  });

  describe("SQL execution flow", () => {
    it("executes SQL when run button clicked", async () => {
      const user = userEvent.setup();

      const initialTabs: QueryTab[] = [
        {
          id: "tab-1",
          name: "Test Query",
          content: "SELECT * FROM Contacts",
          isDirty: false,
        },
      ];

      renderEditorWorkspace({ initialTabs });

      // Click run button
      const runButton = screen.getByTestId("run-button");
      await user.click(runButton);

      // execute should be called with content
      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalledWith(
          "SELECT * FROM Contacts",
          "Test Query",
        );
      });
    });

    it("shows loading state during execution", () => {
      // Mock running state
      mockQueryExecutionReturn = {
        ...defaultMockQueryExecution,
        status: "running",
        isRunning: true,
      };

      renderEditorWorkspace();

      // Spinner should be visible
      expect(screen.getByTestId("run-spinner")).toBeInTheDocument();

      // Run button should be disabled
      expect(screen.getByTestId("run-button")).toBeDisabled();
    });

    it("displays results on successful execution", () => {
      mockQueryExecutionReturn = {
        ...defaultMockQueryExecution,
        status: "ready",
        isRunning: false,
        results: {
          data: {
            columns: ["email", "name"],
            rows: [{ email: "test@test.com", name: "Test User" }],
            totalRows: 1,
            page: 1,
            pageSize: 50,
          },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        },
      };

      renderEditorWorkspace({
        executionResult: createMockExecutionResult({
          status: "success",
          columns: ["email", "name"],
          rows: [{ email: "test@test.com", name: "Test User" }],
          totalRows: 1,
        }),
      });

      // Results pane should show data
      const resultsPane = screen.getByTestId("mock-results-pane");
      expect(resultsPane).toHaveAttribute("data-status", "success");
      expect(screen.getByTestId("row-count")).toHaveTextContent("1 rows");
    });

    it("displays error message on failed execution", () => {
      mockQueryExecutionReturn = {
        ...defaultMockQueryExecution,
        status: "failed",
        isRunning: false,
        errorMessage: "Query execution failed: Invalid syntax",
      };

      renderEditorWorkspace({
        executionResult: createMockExecutionResult({
          status: "error",
          errorMessage: "Query execution failed: Invalid syntax",
        }),
      });

      // Error should be visible
      const resultsPane = screen.getByTestId("mock-results-pane");
      expect(resultsPane).toHaveAttribute("data-status", "error");
      expect(screen.getByTestId("error-message")).toHaveTextContent(
        "Query execution failed: Invalid syntax",
      );
    });
  });

  describe("sidebar behavior", () => {
    it("collapses sidebar when toggle button clicked", async () => {
      const user = userEvent.setup();
      const onToggleSidebar = vi.fn();

      renderEditorWorkspace({ isSidebarCollapsed: false, onToggleSidebar });

      // Sidebar should show expanded state
      const sidebar = screen.getByTestId("mock-sidebar");
      expect(sidebar).toHaveAttribute("data-collapsed", "false");

      // Click toggle
      await user.click(screen.getByTestId("sidebar-toggle"));

      // onToggleSidebar callback should be called
      expect(onToggleSidebar).toHaveBeenCalled();
    });

    it("expands sidebar when toggle button clicked", async () => {
      const user = userEvent.setup();
      const onToggleSidebar = vi.fn();

      renderEditorWorkspace({ isSidebarCollapsed: true, onToggleSidebar });

      // Sidebar should show collapsed state
      const sidebar = screen.getByTestId("mock-sidebar");
      expect(sidebar).toHaveAttribute("data-collapsed", "true");

      // Click toggle
      await user.click(screen.getByTestId("sidebar-toggle"));

      // onToggleSidebar callback should be called
      expect(onToggleSidebar).toHaveBeenCalled();
    });
  });

  describe("dirty tracking", () => {
    // Helper to get toolbar buttons in the icon toolbar area
    function getToolbarIconButtons(): HTMLElement[] {
      const toolbarSection = document.querySelector(
        ".flex.items-center.gap-1.overflow-visible",
      );
      if (!toolbarSection) {
        return [];
      }
      return Array.from(toolbarSection.querySelectorAll("button"));
    }

    it("marks tab as dirty when content changes", async () => {
      const user = userEvent.setup();

      const initialTabs: QueryTab[] = [
        { id: "tab-1", name: "Clean Query", content: "", isDirty: false },
      ];

      renderEditorWorkspace({ initialTabs });

      // Initially no pulse indicator
      const initialPulse = document.querySelector(".animate-pulse");
      expect(initialPulse).toBeNull();

      // Type in editor to make dirty
      const editor = screen.getByTestId("editor-textarea");
      await user.type(editor, "SELECT 1");

      // Should now have dirty indicator (pulse dot)
      await waitFor(() => {
        const pulseIndicator = document.querySelector(".animate-pulse");
        expect(pulseIndicator).not.toBeNull();
      });
    });

    it("clears dirty flag after successful save", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();

      const initialTabs: QueryTab[] = [
        {
          id: "tab-1",
          queryId: "q1", // Must have queryId for auto-save
          name: "Existing Query",
          content: "SELECT 1",
          isDirty: false,
          isNew: false,
        },
      ];

      renderEditorWorkspace({ initialTabs, onSave });

      // Make dirty
      const editor = screen.getByTestId("editor-textarea");
      await user.type(editor, " FROM Test");

      // Should be dirty now (pulse indicator visible)
      await waitFor(() => {
        const pulseIndicator = document.querySelector(".animate-pulse");
        expect(pulseIndicator).not.toBeNull();
      });

      // Find and click save button (first in toolbar icons)
      const toolbarButtons = getToolbarIconButtons();
      const saveButton = toolbarButtons.at(0);
      expect(saveButton).toBeDefined();

      await user.click(saveButton as HTMLElement);

      // onSave should be called after async mutation completes
      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });

      // Should no longer be dirty (no pulse indicator)
      await waitFor(() => {
        const pulseIndicator = document.querySelector(".animate-pulse");
        expect(pulseIndicator).toBeNull();
      });
    });
  });

  describe("query opening from sidebar", () => {
    it("opens saved query in new tab via lazy loading", async () => {
      const user = userEvent.setup();
      const onSelectQuery = vi.fn();

      // Set up mock data for the query that will be loaded
      mockSavedQueryData = {
        id: "test-query-id",
        name: "Test Query",
        sqlText: "SELECT * FROM Test",
        folderId: null,
      };

      renderEditorWorkspace({ onSelectQuery });

      // Initially should show default "New Query" tab
      await waitFor(() => {
        expect(screen.getByText("New Query")).toBeInTheDocument();
      });

      // Click sidebar to select query
      await user.click(screen.getByTestId("sidebar-select-query"));

      // onSelectQuery callback should be called
      expect(onSelectQuery).toHaveBeenCalledWith("test-query-id");

      // The new tab should become active, showing "Test Query" in the active tab indicator
      await waitFor(() => {
        expect(screen.getByText("Test Query")).toBeInTheDocument();
      });

      // Editor should contain the query's SQL text
      await waitFor(() => {
        const editor = screen.getByTestId("editor-textarea");
        expect(editor).toHaveValue("SELECT * FROM Test");
      });
    });

    it("switches to existing tab when query is already open", async () => {
      const user = userEvent.setup();
      const onSelectQuery = vi.fn();
      const onTabChange = vi.fn();

      const initialTabs: QueryTab[] = [
        { id: "tab-1", name: "New Query", content: "", isDirty: false },
        {
          id: "tab-2",
          queryId: "test-query-id",
          name: "Existing Query",
          content: "SELECT 1",
          isDirty: false,
          isNew: false,
        },
      ];

      renderEditorWorkspace({ initialTabs, onSelectQuery, onTabChange });

      // First tab should be active initially (shows "New Query" in header)
      await waitFor(() => {
        expect(screen.getByText("New Query")).toBeInTheDocument();
      });

      // Editor should be empty (first tab's content)
      const editor = screen.getByTestId("editor-textarea");
      expect(editor).toHaveValue("");

      // Click sidebar to select the query that's already open
      await user.click(screen.getByTestId("sidebar-select-query"));

      // Should switch to existing tab, showing "Existing Query" in header
      await waitFor(() => {
        expect(screen.getByText("Existing Query")).toBeInTheDocument();
      });

      // Editor should now show the existing query's content
      await waitFor(() => {
        expect(screen.getByTestId("editor-textarea")).toHaveValue("SELECT 1");
      });

      // onSelectQuery should NOT be called because query is already open
      // (it's called, but the lazy fetch is not triggered - existing tab is used)
      // No additional fetch should occur - just tab switch
    });
  });

  describe("Save As flow", () => {
    it("triggers modal with '(copy)' suffix in initial name", async () => {
      const user = userEvent.setup();

      const initialTabs: QueryTab[] = [
        {
          id: "tab-1",
          queryId: "q1",
          name: "My Query",
          content: "SELECT 1",
          isDirty: false,
          isNew: false,
        },
      ];

      renderEditorWorkspace({ initialTabs });

      // Click the Save As button in the mock editor
      await user.click(screen.getByTestId("editor-save-as-button"));

      // Modal should open with "(copy)" suffix
      await waitFor(() => {
        expect(screen.getByTestId("mock-save-modal")).toBeInTheDocument();
        expect(screen.getByTestId("save-modal-initial-name")).toHaveTextContent(
          "My Query (copy)",
        );
      });
    });

    it("creates new tab for copy while keeping original open", async () => {
      const user = userEvent.setup();

      const initialTabs: QueryTab[] = [
        {
          id: "tab-1",
          queryId: "q1",
          name: "Original Query",
          content: "SELECT 1",
          isDirty: false,
          isNew: false,
        },
      ];

      renderEditorWorkspace({ initialTabs });

      // Initially should show "Original Query" as active tab
      await waitFor(() => {
        expect(screen.getByText("Original Query")).toBeInTheDocument();
      });

      // Click the Save As button
      await user.click(screen.getByTestId("editor-save-as-button"));

      // Modal should open
      await waitFor(() => {
        expect(screen.getByTestId("mock-save-modal")).toBeInTheDocument();
      });

      // Confirm save (this triggers handleSaveAsSuccess with "Original Query (copy)" name)
      await user.click(screen.getByTestId("save-modal-confirm"));

      // Modal should be closed
      await waitFor(() => {
        expect(screen.queryByTestId("mock-save-modal")).not.toBeInTheDocument();
      });

      // The new tab (copy) should become active
      // The mock returns initialName as the saved name, which is "Original Query (copy)"
      await waitFor(() => {
        expect(screen.getByText("Original Query (copy)")).toBeInTheDocument();
      });
    });
  });
});
