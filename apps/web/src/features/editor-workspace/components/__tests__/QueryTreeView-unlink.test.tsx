import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("QueryTreeView unlink features", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/folders", () => HttpResponse.json(mockFolders)),
      http.get("/api/saved-queries", () => HttpResponse.json(mockQueries)),
    );
  });

  it("shows 'Unlink from Query Activity' in context menu for linked query", async () => {
    const onUnlinkQuery = vi.fn();
    render(
      <QueryTreeView
        searchQuery=""
        onSelectQuery={vi.fn()}
        onUnlinkQuery={onUnlinkQuery}
      />,
      { wrapper: createWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByText("Linked Query")).toBeInTheDocument(),
    );

    fireEvent.contextMenu(screen.getByText("Linked Query"));

    await waitFor(() => {
      expect(
        screen.getByText("Unlink from Query Activity"),
      ).toBeInTheDocument();
    });
  });

  it("does not show 'Unlink from Query Activity' in context menu for unlinked query", async () => {
    const onUnlinkQuery = vi.fn();
    render(
      <QueryTreeView
        searchQuery=""
        onSelectQuery={vi.fn()}
        onUnlinkQuery={onUnlinkQuery}
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
      screen.queryByText("Unlink from Query Activity"),
    ).not.toBeInTheDocument();
  });

  it("clicking unlink triggers onUnlinkQuery callback with query id", async () => {
    const user = userEvent.setup();
    const onUnlinkQuery = vi.fn();

    render(
      <QueryTreeView
        searchQuery=""
        onSelectQuery={vi.fn()}
        onUnlinkQuery={onUnlinkQuery}
      />,
      { wrapper: createWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByText("Linked Query")).toBeInTheDocument(),
    );

    fireEvent.contextMenu(screen.getByText("Linked Query"));

    await waitFor(() => {
      expect(
        screen.getByText("Unlink from Query Activity"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByText("Unlink from Query Activity"));

    expect(onUnlinkQuery).toHaveBeenCalledWith("q1");
  });
});
