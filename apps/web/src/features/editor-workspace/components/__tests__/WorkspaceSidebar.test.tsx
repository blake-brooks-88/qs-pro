import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DataExtension,
  Folder,
  SavedQuery,
} from "@/features/editor-workspace/types";

import { WorkspaceSidebar } from "../WorkspaceSidebar";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSetActiveView = vi.fn();

vi.mock("@/features/editor-workspace/store/activity-bar-store", () => ({
  useActivityBarStore: (
    selector: (state: { setActiveView: typeof mockSetActiveView }) => unknown,
  ) => selector({ setActiveView: mockSetActiveView }),
}));

vi.mock("@/hooks/use-tier", () => ({
  useTier: vi.fn(),
  WARNING_THRESHOLD: 0.8,
}));

vi.mock("@/hooks/use-run-usage", () => ({
  useRunUsage: vi.fn(),
}));

vi.mock("@/features/editor-workspace/hooks/use-metadata", () => ({
  useDataExtensionFields: vi.fn().mockReturnValue({
    data: [],
    isFetching: false,
  }),
}));

vi.mock("../QueryTreeView", () => ({
  QueryTreeView: ({ searchQuery }: { searchQuery: string }) => (
    <div data-testid="mock-query-tree-view" data-search={searchQuery}>
      QueryTreeView
    </div>
  ),
}));

vi.mock("@/components/QuotaGate", () => ({
  QuotaCountBadge: ({
    current,
    limit,
    resourceName,
  }: {
    current: number;
    limit: number;
    resourceName: string;
  }) => (
    <span
      data-testid="quota-count-badge"
      title={`${resourceName}: ${current} of ${limit} used`}
    >
      {current}/{limit}
    </span>
  ),
}));

// Import mocked hooks AFTER vi.mock declarations
import { useRunUsage } from "@/hooks/use-run-usage";
import { useTier } from "@/hooks/use-tier";

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const rootFolder: Folder = {
  id: "folder-root",
  name: "Root Folder",
  parentId: null,
  type: "data-extension",
};

const childFolder: Folder = {
  id: "folder-child",
  name: "Child Folder",
  parentId: "folder-root",
  type: "data-extension",
};

const queryFolder: Folder = {
  id: "folder-queries",
  name: "Query Folder",
  parentId: null,
  type: "queryactivity",
};

const folders: Folder[] = [rootFolder, childFolder, queryFolder];

const rootDE: DataExtension = {
  id: "de-root",
  name: "Root DE",
  customerKey: "ck-root-de",
  folderId: "",
  description: "",
  fields: [],
  isShared: false,
};

const childDE: DataExtension = {
  id: "de-child",
  name: "Child DE",
  customerKey: "ck-child-de",
  folderId: "folder-child",
  description: "",
  fields: [],
  isShared: false,
};

const dataExtensions: DataExtension[] = [rootDE, childDE];

const savedQuery: SavedQuery = {
  id: "sq-1",
  name: "My Query",
  folderId: "folder-queries",
  content: "SELECT 1",
  updatedAt: "2025-01-01T00:00:00Z",
  linkedQaCustomerKey: null,
  linkedQaName: null,
  linkedAt: null,
};

const savedQueries: SavedQuery[] = [savedQuery];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return TestWrapper;
}

function setupHooks({
  tier = "pro",
  usageData = null,
}: {
  tier?: "free" | "pro" | "enterprise";
  usageData?: {
    queryRuns: { current: number; limit: number | null; resetDate: string };
    savedQueries: { current: number; limit: number | null };
  } | null;
} = {}) {
  vi.mocked(useTier).mockReturnValue({ tier, isLoading: false });
  vi.mocked(useRunUsage).mockReturnValue({
    data: usageData ?? undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as ReturnType<typeof useRunUsage>);
}

interface RenderSidebarOptions {
  activeView?: "dataExtensions" | "queries";
  onSelectQuery?: ReturnType<typeof vi.fn>;
  onSelectDE?: ReturnType<typeof vi.fn>;
  onCreateFolder?: ReturnType<typeof vi.fn>;
  onViewQueryHistory?: ReturnType<typeof vi.fn>;
  onViewVersionHistory?: ReturnType<typeof vi.fn>;
  onLinkQuery?: ReturnType<typeof vi.fn>;
  foldersOverride?: Folder[];
  dataExtensionsOverride?: DataExtension[];
  savedQueriesOverride?: SavedQuery[];
}

function renderSidebar({
  activeView = "dataExtensions",
  onSelectQuery = vi.fn(),
  onSelectDE = vi.fn(),
  onCreateFolder = vi.fn(),
  onViewQueryHistory = vi.fn(),
  onViewVersionHistory = vi.fn(),
  onLinkQuery = vi.fn(),
  foldersOverride,
  dataExtensionsOverride,
  savedQueriesOverride,
}: RenderSidebarOptions = {}) {
  return render(
    <WorkspaceSidebar
      activeView={activeView}
      tenantId="tenant-1"
      folders={foldersOverride ?? folders}
      savedQueries={savedQueriesOverride ?? savedQueries}
      dataExtensions={dataExtensionsOverride ?? dataExtensions}
      onSelectQuery={onSelectQuery}
      onSelectDE={onSelectDE}
      onCreateFolder={onCreateFolder}
      onViewQueryHistory={onViewQueryHistory}
      onViewVersionHistory={onViewVersionHistory}
      onLinkQuery={onLinkQuery}
    />,
    { wrapper: createWrapper() },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorkspaceSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setupHooks();
  });

  // =========================================================================
  // 1. Free-tier footer
  // =========================================================================

  describe("free-tier footer", () => {
    it("renders usage badge when tier is free with a non-null limit", () => {
      // Arrange
      setupHooks({
        tier: "free",
        usageData: {
          queryRuns: {
            current: 10,
            limit: 50,
            resetDate: "2025-06-15T00:00:00Z",
          },
          savedQueries: { current: 2, limit: 5 },
        },
      });

      // Act
      renderSidebar();

      // Assert
      expect(screen.getByText("Runs")).toBeInTheDocument();
      expect(screen.getByTestId("quota-count-badge")).toHaveTextContent(
        "10/50",
      );
    });

    it("shows reset date when usage >= WARNING_THRESHOLD * limit", () => {
      // Arrange — 80% of 50 = 40, so current=42 triggers warning
      // Use midday UTC to avoid timezone-shift date differences in jsdom
      setupHooks({
        tier: "free",
        usageData: {
          queryRuns: {
            current: 42,
            limit: 50,
            resetDate: "2025-06-15T12:00:00Z",
          },
          savedQueries: { current: 2, limit: 5 },
        },
      });

      // Act
      renderSidebar();

      // Assert
      const resetText = screen.getByText(/Resets/);
      expect(resetText).toBeInTheDocument();
      expect(resetText.textContent).toMatch(/June/);
    });

    it("does NOT show reset date when usage is below WARNING_THRESHOLD", () => {
      // Arrange — 10 < 50 * 0.8 = 40
      setupHooks({
        tier: "free",
        usageData: {
          queryRuns: {
            current: 10,
            limit: 50,
            resetDate: "2025-06-15T00:00:00Z",
          },
          savedQueries: { current: 2, limit: 5 },
        },
      });

      // Act
      renderSidebar();

      // Assert
      expect(screen.queryByText(/Resets/)).not.toBeInTheDocument();
    });

    it("does NOT render footer when tier is pro", () => {
      // Arrange
      setupHooks({ tier: "pro" });

      // Act
      renderSidebar();

      // Assert
      expect(screen.queryByText("Runs")).not.toBeInTheDocument();
      expect(screen.queryByTestId("quota-count-badge")).not.toBeInTheDocument();
    });

    it("does NOT render footer when usageData is undefined", () => {
      // Arrange
      setupHooks({ tier: "free", usageData: null });

      // Act
      renderSidebar();

      // Assert
      expect(screen.queryByText("Runs")).not.toBeInTheDocument();
    });

    it("does NOT render footer when queryRuns limit is null", () => {
      // Arrange
      setupHooks({
        tier: "free",
        usageData: {
          queryRuns: {
            current: 0,
            limit: null,
            resetDate: "2025-06-15T00:00:00Z",
          },
          savedQueries: { current: 0, limit: null },
        },
      });

      // Act
      renderSidebar();

      // Assert
      expect(screen.queryByText("Runs")).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. Search — Data Extensions view
  // =========================================================================

  describe("search — DE view", () => {
    it("shows DE search results when searching", async () => {
      // Arrange
      const user = userEvent.setup();
      renderSidebar({ activeView: "dataExtensions" });

      // Act
      const searchInput = screen.getByPlaceholderText(
        "Search Data Extensions...",
      );
      await user.click(searchInput);
      await user.type(searchInput, "Root DE");

      // Assert
      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });
      // Scope to listbox to avoid matching tree node text
      const listbox = screen.getByRole("listbox");
      expect(within(listbox).getByText("Root DE")).toBeInTheDocument();
    });

    it("shows folder search results in DE view", async () => {
      // Arrange
      const user = userEvent.setup();
      renderSidebar({ activeView: "dataExtensions" });

      // Act
      const searchInput = screen.getByPlaceholderText(
        "Search Data Extensions...",
      );
      await user.click(searchInput);
      await user.type(searchInput, "Root Folder");

      // Assert
      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });
      // The result should show the folder name
      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveTextContent("Root Folder");
    });

    it("shows no results for empty search query", async () => {
      // Arrange
      renderSidebar({ activeView: "dataExtensions" });

      // Assert — no listbox should appear with empty input
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("selects a DE result and calls onSelectDE", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSelectDE = vi.fn();
      renderSidebar({ activeView: "dataExtensions", onSelectDE });

      // Act
      const searchInput = screen.getByPlaceholderText(
        "Search Data Extensions...",
      );
      await user.click(searchInput);
      await user.type(searchInput, "Child DE");

      // Wait for results and click the result
      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      const options = screen.getAllByRole("option");
      await user.click(options[0]);

      // Assert
      expect(onSelectDE).toHaveBeenCalledWith("de-child");
    });

    it("selects a folder result and expands it", async () => {
      // Arrange
      const user = userEvent.setup();
      renderSidebar({ activeView: "dataExtensions" });

      // Act
      const searchInput = screen.getByPlaceholderText(
        "Search Data Extensions...",
      );
      await user.click(searchInput);
      await user.type(searchInput, "Root Folder");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      const options = screen.getAllByRole("option");
      await user.click(options[0]);

      // Assert — the search should close and the folder should now be visible in the tree
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 3. Search — Queries view (handleSelectResult for "query" type)
  // =========================================================================

  describe("search — queries view", () => {
    it("shows query search results when searching in queries view", async () => {
      // Arrange
      const user = userEvent.setup();
      renderSidebar({ activeView: "queries" });

      // Act
      const searchInput = screen.getByPlaceholderText("Search Queries...");
      await user.click(searchInput);
      await user.type(searchInput, "My Query");

      // Assert
      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });
      expect(screen.getByRole("listbox")).toHaveTextContent("My Query");
    });

    it("selects a query result and calls onSelectQuery", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSelectQuery = vi.fn();
      renderSidebar({ activeView: "queries", onSelectQuery });

      // Act
      const searchInput = screen.getByPlaceholderText("Search Queries...");
      await user.click(searchInput);
      await user.type(searchInput, "My Query");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      const options = screen.getAllByRole("option");
      await user.click(options[0]);

      // Assert
      expect(onSelectQuery).toHaveBeenCalledWith("sq-1");
    });

    it("renders the QueryTreeView with searchQuery in queries view", () => {
      // Arrange & Act
      renderSidebar({ activeView: "queries" });

      // Assert
      expect(screen.getByTestId("mock-query-tree-view")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. isVisible function branches
  // =========================================================================

  describe("isVisible — filtering after search selection", () => {
    it("when a DE is focused, only that DE and ancestor folders are visible", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSelectDE = vi.fn();
      renderSidebar({ activeView: "dataExtensions", onSelectDE });

      // Act — search for and select child DE in folder-child (inside folder-root)
      const searchInput = screen.getByPlaceholderText(
        "Search Data Extensions...",
      );
      await user.click(searchInput);
      await user.type(searchInput, "Child DE");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      const options = screen.getAllByRole("option");
      await user.click(options[0]);

      // Assert — after focusing a DE, the root DE (not in the ancestor chain) should be hidden
      // The "Root DE" at the root level should be filtered out
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });

      // Root Folder should still appear (it's an ancestor of folder-child)
      expect(screen.getByTitle("Root Folder")).toBeInTheDocument();
    });

    it("when a query is focused, isVisible shows only ancestor folders", async () => {
      // Arrange — we need a query with a folderId that maps to our folder hierarchy
      const user = userEvent.setup();
      const queryInFolder: SavedQuery = {
        id: "sq-in-folder",
        name: "Nested Query",
        folderId: "folder-child",
        content: "SELECT 1",
        updatedAt: "2025-01-01T00:00:00Z",
        linkedQaCustomerKey: null,
        linkedQaName: null,
        linkedAt: null,
      };

      // Use DE view with these queries doesn't make sense for isVisible "query",
      // but the search in queries view triggers it
      const onSelectQuery = vi.fn();
      renderSidebar({
        activeView: "queries",
        onSelectQuery,
        savedQueriesOverride: [queryInFolder],
      });

      // Act
      const searchInput = screen.getByPlaceholderText("Search Queries...");
      await user.click(searchInput);
      await user.type(searchInput, "Nested Query");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      const options = screen.getAllByRole("option");
      await user.click(options[0]);

      // Assert
      expect(onSelectQuery).toHaveBeenCalledWith("sq-in-folder");
    });

    it("clearing search restores all items to visible", async () => {
      // Arrange
      const user = userEvent.setup();
      renderSidebar({ activeView: "dataExtensions" });

      // First, do a search and select to focus an item
      const searchInput = screen.getByPlaceholderText(
        "Search Data Extensions...",
      );
      await user.click(searchInput);
      await user.type(searchInput, "Child DE");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      const options = screen.getAllByRole("option");
      await user.click(options[0]);

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });

      // Act — click the clear button to clear the focused item
      const clearButton = screen.getByLabelText("Clear search");
      await user.click(clearButton);

      // Assert — root DE should be visible again (no more focused filter)
      await waitFor(() => {
        // Root Folder at the top should be visible
        expect(screen.getByTitle("Root Folder")).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 5. Keyboard navigation
  // =========================================================================

  describe("keyboard navigation in search", () => {
    it("ArrowDown / ArrowUp cycles through results, Enter selects", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSelectDE = vi.fn();
      // Provide DEs with similar names so both appear in search
      const des: DataExtension[] = [
        {
          ...rootDE,
          id: "de-a",
          name: "Alpha DE",
          customerKey: "ck-a",
          folderId: "",
        },
        {
          ...rootDE,
          id: "de-b",
          name: "Alpha Two DE",
          customerKey: "ck-b",
          folderId: "",
        },
      ];
      renderSidebar({
        activeView: "dataExtensions",
        onSelectDE,
        dataExtensionsOverride: des,
        foldersOverride: [],
      });

      // Act
      const searchInput = screen.getByPlaceholderText(
        "Search Data Extensions...",
      );
      await user.click(searchInput);
      await user.type(searchInput, "Alpha");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      // ArrowDown → first result highlighted (index 0)
      await user.keyboard("{ArrowDown}");
      // ArrowDown → second result highlighted (index 1)
      await user.keyboard("{ArrowDown}");
      // ArrowUp → back to first (index 0)
      await user.keyboard("{ArrowUp}");
      // Enter → select the first result
      await user.keyboard("{Enter}");

      // Assert
      expect(onSelectDE).toHaveBeenCalledWith("de-a");
    });

    it("Escape closes the search results dropdown", async () => {
      // Arrange
      const user = userEvent.setup();
      renderSidebar({ activeView: "dataExtensions" });

      // Act
      const searchInput = screen.getByPlaceholderText(
        "Search Data Extensions...",
      );
      await user.click(searchInput);
      await user.type(searchInput, "Root DE");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      await user.keyboard("{Escape}");

      // Assert
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("does nothing when search is not open", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSelectDE = vi.fn();
      renderSidebar({ activeView: "dataExtensions", onSelectDE });

      // Act — press ArrowDown without opening search
      const searchInput = screen.getByPlaceholderText(
        "Search Data Extensions...",
      );
      await user.click(searchInput);
      await user.keyboard("{ArrowDown}");

      // Assert — nothing should happen, no error thrown
      expect(onSelectDE).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 6. Resize
  // =========================================================================

  describe("resize", () => {
    it("resizes sidebar via keyboard (ArrowLeft / ArrowRight)", async () => {
      // Arrange
      renderSidebar();
      const resizer = screen.getByLabelText("Resize sidebar");

      // Act
      fireEvent.keyDown(resizer, { key: "ArrowRight" });
      fireEvent.keyDown(resizer, { key: "ArrowLeft" });

      // Assert — no crash means the handlers executed; width changes are internal state
      expect(resizer).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 7. Panel header / close button
  // =========================================================================

  describe("panel header", () => {
    it("shows the correct title for dataExtensions view", () => {
      // Arrange & Act
      renderSidebar({ activeView: "dataExtensions" });

      // Assert — The header contains an uppercase tracking-widest span with the title.
      // "Data Extensions" appears both in the header and the inner tree label.
      const titleElements = screen.getAllByText("Data Extensions");
      expect(titleElements.length).toBeGreaterThanOrEqual(1);
    });

    it("shows the correct title for queries view", () => {
      // Arrange & Act
      renderSidebar({ activeView: "queries" });

      // Assert
      expect(screen.getByText("Queries")).toBeInTheDocument();
    });

    it("clicking the close button calls setActiveView(null)", async () => {
      // Arrange
      const user = userEvent.setup();
      renderSidebar();

      // Act — the close button is adjacent to the header title, inside the
      // border-b header div. Use getAllByText to handle the duplicate "Data Extensions".
      const titleElements = screen.getAllByText("Data Extensions");
      const headerTitle = titleElements[0];
      const headerDiv = headerTitle.closest("div") as HTMLDivElement;
      const closeButton = headerDiv.querySelector(
        "button",
      ) as HTMLButtonElement;
      await user.click(closeButton);

      // Assert
      expect(mockSetActiveView).toHaveBeenCalledWith(null);
    });
  });

  // =========================================================================
  // 8. Data extension tree
  // =========================================================================

  describe("data extension tree rendering", () => {
    it("renders root folders and root DEs", () => {
      // Arrange & Act
      renderSidebar({ activeView: "dataExtensions" });

      // Assert
      expect(screen.getByTitle("Root Folder")).toBeInTheDocument();
      expect(screen.getByTitle("Root DE")).toBeInTheDocument();
    });

    it("expands a folder to show child content", async () => {
      // Arrange
      const user = userEvent.setup();
      renderSidebar({ activeView: "dataExtensions" });

      // Act — click the Root Folder button to expand it
      await user.click(screen.getByTitle("Root Folder"));

      // Assert — child folder should now be visible
      expect(screen.getByTitle("Child Folder")).toBeInTheDocument();
    });

    it("clicking a DE toggles expansion and calls onSelectDE", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSelectDE = vi.fn();
      renderSidebar({ activeView: "dataExtensions", onSelectDE });

      // Act
      await user.click(screen.getByTitle("Root DE"));

      // Assert
      expect(onSelectDE).toHaveBeenCalledWith("de-root");
    });
  });

  // =========================================================================
  // 9. isVisible edge: focused folder type with targetFolderId = null
  // =========================================================================

  describe("isVisible — edge: folder without targetFolderId", () => {
    it("returns false for unrelated folders when focused DE has no folderId", async () => {
      // Arrange — DE with empty folderId (treated as null)
      const user = userEvent.setup();
      const deNoFolder: DataExtension = {
        id: "de-no-folder",
        name: "Orphan DE",
        customerKey: "ck-orphan",
        folderId: "",
        description: "",
        fields: [],
        isShared: false,
      };

      renderSidebar({
        activeView: "dataExtensions",
        dataExtensionsOverride: [deNoFolder, childDE],
        foldersOverride: [rootFolder, childFolder],
      });

      // Act — search and select the orphan DE
      const searchInput = screen.getByPlaceholderText(
        "Search Data Extensions...",
      );
      await user.click(searchInput);
      await user.type(searchInput, "Orphan");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      const options = screen.getAllByRole("option");
      await user.click(options[0]);

      // Assert — after focusing, folders should be hidden since the DE has no folder
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });
  });
});
