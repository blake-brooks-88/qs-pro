import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { QueryTreeView } from "../QueryTreeView";

const mockFolders = [
  {
    id: "f1",
    name: "Folder A",
    parentId: null,
    visibility: "personal",
    userId: "u1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

const mockQueries = [
  {
    id: "q1",
    name: "Linked Query",
    folderId: null,
    updatedAt: "2024-01-01T00:00:00Z",
    linkedQaCustomerKey: "qa-key-1",
    linkedQaName: "My QA",
    linkedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "q2",
    name: "Unlinked Query",
    folderId: null,
    updatedAt: "2024-01-01T00:00:00Z",
    linkedQaCustomerKey: null,
    linkedQaName: null,
    linkedAt: null,
  },
];

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

describe("QueryTreeView linking features", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/folders", () => HttpResponse.json(mockFolders)),
      http.get("/api/saved-queries", () => HttpResponse.json(mockQueries)),
      http.get("/api/features", () =>
        HttpResponse.json({
          features: { teamCollaboration: false },
        }),
      ),
    );
  });

  it("renders LinkedBadge on queries with linkedQaCustomerKey", async () => {
    render(<QueryTreeView searchQuery="" onSelectQuery={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText("Linked Query")).toBeInTheDocument(),
    );

    expect(screen.getByTitle("Linked to My QA")).toBeInTheDocument();
  });

  it("does not render LinkedBadge on unlinked queries", async () => {
    render(<QueryTreeView searchQuery="" onSelectQuery={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText("Unlinked Query")).toBeInTheDocument(),
    );

    const badges = screen.queryAllByTitle(/Linked to/);
    expect(badges).toHaveLength(1);
  });

  it("does NOT show 'Link to Query Activity' in context menu for personal queries", async () => {
    const onLinkQuery = vi.fn();
    render(
      <QueryTreeView
        searchQuery=""
        onSelectQuery={vi.fn()}
        onLinkQuery={onLinkQuery}
      />,
      { wrapper: createWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByText("Unlinked Query")).toBeInTheDocument(),
    );

    fireEvent.contextMenu(screen.getByText("Unlinked Query"));

    await waitFor(() => {
      expect(screen.getByText("Rename")).toBeInTheDocument();
    });

    expect(
      screen.queryByText("Link to Query Activity"),
    ).not.toBeInTheDocument();
  });

  it("does not show 'Link to Query Activity' in context menu for linked queries", async () => {
    const onLinkQuery = vi.fn();
    render(
      <QueryTreeView
        searchQuery=""
        onSelectQuery={vi.fn()}
        onLinkQuery={onLinkQuery}
      />,
      { wrapper: createWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByText("Linked Query")).toBeInTheDocument(),
    );

    fireEvent.contextMenu(screen.getByText("Linked Query"));

    await waitFor(() => {
      expect(screen.getByText("Rename")).toBeInTheDocument();
    });

    expect(
      screen.queryByText("Link to Query Activity"),
    ).not.toBeInTheDocument();
  });
});
