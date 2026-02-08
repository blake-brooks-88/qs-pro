import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { QueryTreeView } from "./QueryTreeView";

const mockFolders = [
  {
    id: "f1",
    name: "Folder A",
    parentId: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "f2",
    name: "Folder B",
    parentId: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "f3",
    name: "Nested Folder",
    parentId: "f1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

const mockQueries = [
  {
    id: "q1",
    name: "Query One",
    folderId: null,
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "q2",
    name: "Query Two",
    folderId: "f1",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "q3",
    name: "Query Three",
    folderId: "f3",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

beforeEach(() => {
  server.use(
    http.get("/api/folders", () => HttpResponse.json(mockFolders)),
    http.get("/api/saved-queries", () => HttpResponse.json(mockQueries)),
  );
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return TestWrapper;
}

describe("QueryTreeView", () => {
  describe("folder hierarchy rendering", () => {
    it("renders root-level folders and queries", async () => {
      const onSelectQuery = vi.fn();
      render(<QueryTreeView searchQuery="" onSelectQuery={onSelectQuery} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText("Folder A")).toBeInTheDocument();
        expect(screen.getByText("Folder B")).toBeInTheDocument();
        expect(screen.getByText("Query One")).toBeInTheDocument();
      });
    });

    it("shows nested folders when parent is expanded", async () => {
      const user = userEvent.setup();
      render(<QueryTreeView searchQuery="" onSelectQuery={vi.fn()} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByText("Folder A")).toBeInTheDocument(),
      );

      expect(screen.queryByText("Nested Folder")).not.toBeInTheDocument();

      await user.click(screen.getByText("Folder A"));

      await waitFor(() => {
        expect(screen.getByText("Nested Folder")).toBeInTheDocument();
        expect(screen.getByText("Query Two")).toBeInTheDocument();
      });
    });
  });

  describe("expand/collapse behavior", () => {
    it("toggles folder expansion on click", async () => {
      const user = userEvent.setup();
      render(<QueryTreeView searchQuery="" onSelectQuery={vi.fn()} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByText("Folder A")).toBeInTheDocument(),
      );

      await user.click(screen.getByText("Folder A"));
      await waitFor(() =>
        expect(screen.getByText("Nested Folder")).toBeInTheDocument(),
      );

      await user.click(screen.getByText("Folder A"));
      await waitFor(() =>
        expect(screen.queryByText("Nested Folder")).not.toBeInTheDocument(),
      );
    });
  });

  describe("context menus", () => {
    it("shows context menu on right-click for folder", async () => {
      render(<QueryTreeView searchQuery="" onSelectQuery={vi.fn()} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByText("Folder A")).toBeInTheDocument(),
      );

      fireEvent.contextMenu(screen.getByText("Folder A"));

      await waitFor(() => {
        expect(screen.getByText("Rename")).toBeInTheDocument();
        expect(screen.getByText("Delete")).toBeInTheDocument();
      });
    });

    it("shows context menu on right-click for query", async () => {
      render(<QueryTreeView searchQuery="" onSelectQuery={vi.fn()} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByText("Query One")).toBeInTheDocument(),
      );

      fireEvent.contextMenu(screen.getByText("Query One"));

      await waitFor(() => {
        expect(screen.getByText("Rename")).toBeInTheDocument();
        expect(screen.getByText("Delete")).toBeInTheDocument();
      });
    });

    it("triggers run history callback from query context menu", async () => {
      const user = userEvent.setup();
      const onViewQueryHistory = vi.fn();

      render(
        <QueryTreeView
          searchQuery=""
          onSelectQuery={vi.fn()}
          onViewQueryHistory={onViewQueryHistory}
        />,
        {
          wrapper: createWrapper(),
        },
      );

      await waitFor(() =>
        expect(screen.getByText("Query One")).toBeInTheDocument(),
      );

      fireEvent.contextMenu(screen.getByText("Query One"));

      await waitFor(() => {
        expect(screen.getByText("View Run History")).toBeInTheDocument();
      });

      await user.click(screen.getByText("View Run History"));

      expect(onViewQueryHistory).toHaveBeenCalledWith("q1");
    });
  });

  describe("inline rename", () => {
    it("enables inline rename on double-click", async () => {
      const user = userEvent.setup();
      render(<QueryTreeView searchQuery="" onSelectQuery={vi.fn()} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByText("Query One")).toBeInTheDocument(),
      );

      await user.dblClick(screen.getByText("Query One"));

      await waitFor(() => {
        const input = screen.getByRole("textbox");
        expect(input).toHaveValue("Query One");
      });
    });

    it("cancels rename on Escape", async () => {
      const user = userEvent.setup();
      render(<QueryTreeView searchQuery="" onSelectQuery={vi.fn()} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByText("Query One")).toBeInTheDocument(),
      );

      await user.dblClick(screen.getByText("Query One"));

      await waitFor(() =>
        expect(screen.getByRole("textbox")).toBeInTheDocument(),
      );

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(screen.getByText("Query One")).toBeInTheDocument();
      });
    });
  });

  describe("search filtering", () => {
    it("filters folders and queries by search term", async () => {
      render(<QueryTreeView searchQuery="One" onSelectQuery={vi.fn()} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText("Query One")).toBeInTheDocument();
        expect(screen.queryByText("Query Two")).not.toBeInTheDocument();
        expect(screen.queryByText("Query Three")).not.toBeInTheDocument();
      });
    });

    it("shows empty state when search has no matches", async () => {
      render(
        <QueryTreeView searchQuery="nonexistent" onSelectQuery={vi.fn()} />,
        {
          wrapper: createWrapper(),
        },
      );

      await waitFor(() => {
        expect(screen.getByText(/No saved queries yet/)).toBeInTheDocument();
      });
    });
  });

  describe("empty state", () => {
    it("shows empty state when no folders or queries exist", async () => {
      server.use(
        http.get("/api/folders", () => HttpResponse.json([])),
        http.get("/api/saved-queries", () => HttpResponse.json([])),
      );

      render(<QueryTreeView searchQuery="" onSelectQuery={vi.fn()} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText(/No saved queries yet/)).toBeInTheDocument();
        expect(
          screen.getByText(/Press Ctrl\+S to save your first query/),
        ).toBeInTheDocument();
      });
    });
  });

  describe("query selection", () => {
    it("calls onSelectQuery when query is clicked", async () => {
      const onSelectQuery = vi.fn();
      const user = userEvent.setup();

      render(<QueryTreeView searchQuery="" onSelectQuery={onSelectQuery} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByText("Query One")).toBeInTheDocument(),
      );

      await user.click(screen.getByText("Query One"));

      expect(onSelectQuery).toHaveBeenCalledWith("q1");
    });
  });
});
