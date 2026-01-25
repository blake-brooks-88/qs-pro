import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceSidebar } from "@/features/editor-workspace/components/WorkspaceSidebar";
import {
  DataExtension,
  Folder,
  SavedQuery,
} from "@/features/editor-workspace/types";
import { server } from "@/test/mocks/server";

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

const renderSidebar = (
  folders: Folder[],
  dataExtensions: DataExtension[],
  savedQueries: SavedQuery[] = [],
) => {
  const queryClient = createQueryClient();
  return render(
    <WorkspaceSidebar
      tenantId="tenant-1"
      folders={folders}
      savedQueries={savedQueries}
      dataExtensions={dataExtensions}
      isCollapsed={false}
      onToggle={() => undefined}
    />,
    { wrapper: createWrapper(queryClient) },
  );
};

describe("WorkspaceSidebar", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it("renders root folders and expands to show child folders", async () => {
    const user = userEvent.setup();
    // Arrange
    const folders: Folder[] = [
      {
        id: "root",
        name: "Root Folder",
        parentId: null,
        type: "data-extension",
      },
      {
        id: "child",
        name: "Child Folder",
        parentId: "root",
        type: "data-extension",
      },
    ];

    // Act
    renderSidebar(folders, []);

    // Assert
    expect(
      screen.getByRole("button", { name: /root folder/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /child folder/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /root folder/i }));

    expect(
      screen.getByRole("button", { name: /child folder/i }),
    ).toBeInTheDocument();
  });

  it("expands data extensions to reveal fields", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/metadata/fields", () => {
        return HttpResponse.json([{ Name: "EmailAddress", FieldType: "Text" }]);
      }),
    );

    const folders: Folder[] = [
      {
        id: "root",
        name: "Root Folder",
        parentId: null,
        type: "data-extension",
      },
    ];
    const dataExtensions: DataExtension[] = [
      {
        id: "de-1",
        name: "Customers",
        customerKey: "DE_Customers",
        folderId: "root",
        description: "",
        fields: [],
      },
    ];

    renderSidebar(folders, dataExtensions);

    await user.click(screen.getByRole("button", { name: /root folder/i }));
    await user.click(screen.getByRole("button", { name: /customers/i }));

    await waitFor(() => {
      expect(screen.getByText("EmailAddress")).toBeInTheDocument();
    });
    expect(screen.getByText("Text")).toBeInTheDocument();
  });

  it("SidebarSearch_OnType_ShowsResultsInPopover", async () => {
    const user = userEvent.setup();
    const folders: Folder[] = [
      { id: "1", name: "Sales", parentId: null, type: "data-extension" },
    ];
    const de: DataExtension[] = [
      {
        id: "de1",
        name: "Customers",
        customerKey: "C1",
        folderId: "1",
        description: "",
        fields: [],
      },
    ];

    renderSidebar(folders, de);

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "Cust");

    expect(
      screen.getByRole("option", { name: /customers/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Sales").length).toBeGreaterThan(0); // Can be folder name or path
  });

  it("SidebarSearch_OnSelectResult_FiltersTreeToAncestorChain", async () => {
    const user = userEvent.setup();
    const folders: Folder[] = [
      { id: "1", name: "Root", parentId: null, type: "data-extension" },
      { id: "2", name: "Sub", parentId: "1", type: "data-extension" },
      { id: "3", name: "Other", parentId: null, type: "data-extension" },
    ];
    const de: DataExtension[] = [
      {
        id: "de1",
        name: "TargetDE",
        customerKey: "T1",
        folderId: "2",
        description: "",
        fields: [],
      },
    ];

    renderSidebar(folders, de);

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "Target");
    await user.click(screen.getByRole("option", { name: /targetde/i }));

    // Tree should be filtered
    expect(screen.getByRole("button", { name: /root/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sub/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /targetde/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /other/i }),
    ).not.toBeInTheDocument();
  });

  it("SidebarSearch_OnClear_RestoresTreeState", async () => {
    const user = userEvent.setup();
    const folders: Folder[] = [
      { id: "1", name: "Root", parentId: null, type: "data-extension" },
      { id: "2", name: "Other", parentId: null, type: "data-extension" },
    ];

    renderSidebar(folders, []);

    // Initial state: Both roots visible
    expect(screen.getByRole("button", { name: /root/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /other/i })).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "Root");
    await user.click(screen.getByRole("option", { name: /root/i }));

    // Filtered state
    expect(
      screen.queryByRole("button", { name: /other/i }),
    ).not.toBeInTheDocument();

    // Clear search
    await user.click(screen.getByRole("button", { name: /clear search/i }));

    // Restored state
    expect(screen.getByRole("button", { name: /other/i })).toBeInTheDocument();
  });

  it("SidebarSearch_OnQueriesTab_FiltersQueries", async () => {
    const user = userEvent.setup();
    const queries: SavedQuery[] = [
      {
        id: "q1",
        name: "Select All",
        folderId: "root",
        content: "SELECT *",
        updatedAt: "",
      },
      {
        id: "q2",
        name: "Filter Users",
        folderId: "root",
        content: "SELECT *",
        updatedAt: "",
      },
    ];

    renderSidebar([], [], queries);

    // Switch to queries tab
    await user.click(screen.getByRole("button", { name: /queries/i }));

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "Select");

    expect(
      screen.getByRole("option", { name: /select all/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /filter users/i }),
    ).not.toBeInTheDocument();
  });

  describe("Selection callbacks", () => {
    it("calls onSelectDE when data extension is clicked", async () => {
      const user = userEvent.setup();
      const onSelectDE = vi.fn();

      server.use(
        http.get("/api/metadata/fields", () => {
          return HttpResponse.json([]);
        }),
      );

      const folders: Folder[] = [
        {
          id: "root",
          name: "Root Folder",
          parentId: null,
          type: "data-extension",
        },
      ];
      const dataExtensions: DataExtension[] = [
        {
          id: "de-1",
          name: "Customers",
          customerKey: "DE_Customers",
          folderId: "root",
          description: "",
          fields: [],
        },
      ];

      const queryClient = createQueryClient();
      render(
        <WorkspaceSidebar
          tenantId="tenant-1"
          folders={folders}
          savedQueries={[]}
          dataExtensions={dataExtensions}
          isCollapsed={false}
          onToggle={() => undefined}
          onSelectDE={onSelectDE}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      // Expand root folder
      await user.click(screen.getByRole("button", { name: /root folder/i }));

      // Click on data extension
      await user.click(screen.getByRole("button", { name: /customers/i }));

      expect(onSelectDE).toHaveBeenCalledWith("de-1");
    });

    it("calls onSelectQuery when query is clicked in queries tab", async () => {
      const user = userEvent.setup();
      const onSelectQuery = vi.fn();

      const folders: Folder[] = [
        {
          id: "lib-folder",
          name: "Sales",
          parentId: null,
          type: "library",
        },
      ];
      const queries: SavedQuery[] = [
        {
          id: "q1",
          name: "Customer Report",
          folderId: "lib-folder",
          content: "SELECT * FROM [Customers]",
          updatedAt: "2024-01-01",
        },
      ];

      const queryClient = createQueryClient();
      render(
        <WorkspaceSidebar
          tenantId="tenant-1"
          folders={folders}
          savedQueries={queries}
          dataExtensions={[]}
          isCollapsed={false}
          onToggle={() => undefined}
          onSelectQuery={onSelectQuery}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      // Switch to queries tab
      await user.click(screen.getByRole("button", { name: /^Queries$/i }));

      // Click on query
      await user.click(
        screen.getByRole("button", { name: /customer report/i }),
      );

      expect(onSelectQuery).toHaveBeenCalledWith("q1");
    });
  });

  describe("Collapsed state", () => {
    it("renders collapsed sidebar without search input", () => {
      const queryClient = createQueryClient();
      render(
        <WorkspaceSidebar
          tenantId="tenant-1"
          folders={[]}
          savedQueries={[]}
          dataExtensions={[]}
          isCollapsed={true}
          onToggle={() => undefined}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      // Collapsed sidebar should not show search input
      expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    });

    it("calls onToggle when expand button clicked in collapsed state", async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();

      const queryClient = createQueryClient();
      render(
        <WorkspaceSidebar
          tenantId="tenant-1"
          folders={[]}
          savedQueries={[]}
          dataExtensions={[]}
          isCollapsed={true}
          onToggle={onToggle}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      // Find and click the expand button (first button in collapsed sidebar)
      const buttons = screen.getAllByRole("button");
      const expandButton = buttons[0];
      if (!expandButton) {
        throw new Error("Expand button not found");
      }
      await user.click(expandButton);

      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe("Keyboard navigation", () => {
    it("navigates search results with arrow keys and Enter", async () => {
      const user = userEvent.setup();
      const onSelectDE = vi.fn();

      const folders: Folder[] = [
        { id: "1", name: "Folder A", parentId: null, type: "data-extension" },
      ];
      const dataExtensions: DataExtension[] = [
        {
          id: "de1",
          name: "Alpha",
          customerKey: "K1",
          folderId: "1",
          description: "",
          fields: [],
        },
        {
          id: "de2",
          name: "Beta",
          customerKey: "K2",
          folderId: "1",
          description: "",
          fields: [],
        },
      ];

      const queryClient = createQueryClient();
      render(
        <WorkspaceSidebar
          tenantId="tenant-1"
          folders={folders}
          savedQueries={[]}
          dataExtensions={dataExtensions}
          isCollapsed={false}
          onToggle={() => undefined}
          onSelectDE={onSelectDE}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, "a");

      // Arrow down to first result
      await user.keyboard("{ArrowDown}");

      // Enter to select
      await user.keyboard("{Enter}");

      expect(onSelectDE).toHaveBeenCalledWith("de1");
    });
  });
});
