import type { FolderResponse, SavedQueryListItem } from "@qpp/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { SharedQuerySection } from "../SharedQuerySection";

const mockSharedFolder: FolderResponse = {
  id: "sf1",
  name: "Team Folder",
  parentId: null,
  visibility: "shared",
  userId: "u1",
  creatorName: "Alice",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const mockSharedQuery: SavedQueryListItem = {
  id: "sq1",
  name: "Shared Query",
  folderId: "sf1",
  updatedAt: "2024-01-01T00:00:00Z",
  linkedQaCustomerKey: "qa-key-1",
  linkedQaName: "My QA",
  linkedAt: "2024-01-01T00:00:00Z",
  updatedByUserName: "Bob",
};

const mockUnlinkedSharedQuery: SavedQueryListItem = {
  id: "sq2",
  name: "Unlinked Shared Query",
  folderId: "sf1",
  updatedAt: "2024-01-01T00:00:00Z",
  linkedQaCustomerKey: null,
  linkedQaName: null,
  linkedAt: null,
  updatedByUserName: null,
};

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

function buildProps(
  overrides?: Partial<Parameters<typeof SharedQuerySection>[0]>,
) {
  const folders = [mockSharedFolder];
  const queries = [mockSharedQuery, mockUnlinkedSharedQuery];
  const foldersByParent = new Map<string | null, FolderResponse[]>();
  foldersByParent.set(null, folders);
  const queriesByFolder = new Map<string | null, SavedQueryListItem[]>();
  queriesByFolder.set("sf1", queries);

  return {
    folders,
    queries,
    foldersByParent,
    queriesByFolder,
    onSelectQuery: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onRenameQuery: vi.fn(),
    onDeleteQuery: vi.fn(),
    onCreateFolder: vi.fn(),
    onFinishCreate: vi.fn(),
    creatingIn: null,
    onMoveQueryToFolder: vi.fn(),
    onDuplicateToPersonal: vi.fn(),
    onLinkQuery: vi.fn(),
    onUnlinkQuery: vi.fn(),
    allSharedFolders: folders,
    ...overrides,
  };
}

describe("SharedQuerySection", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/features", () =>
        HttpResponse.json({
          features: { teamCollaboration: false },
        }),
      ),
    );
  });

  it("renders Enterprise badge when teamCollaboration is disabled", async () => {
    render(
      <SharedQuerySection {...buildProps({ folders: [], queries: [] })} />,
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() =>
      expect(screen.getByText("Shared Queries")).toBeInTheDocument(),
    );

    expect(screen.getByLabelText("Enterprise feature")).toBeInTheDocument();
  });

  it("renders locked teaser with upgrade CTA for non-Enterprise users with no content", async () => {
    const emptyFoldersByParent = new Map<string | null, FolderResponse[]>();
    const emptyQueriesByFolder = new Map<string | null, SavedQueryListItem[]>();

    render(
      <SharedQuerySection
        {...buildProps({
          folders: [],
          queries: [],
          foldersByParent: emptyFoldersByParent,
          queriesByFolder: emptyQueriesByFolder,
        })}
      />,
      { wrapper: createWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByText("Shared Queries")).toBeInTheDocument(),
    );

    expect(
      screen.getByText("Share queries with your team."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Upgrade to Enterprise to collaborate."),
    ).toBeInTheDocument();
  });

  it("renders shared folder tree when teamCollaboration is enabled", async () => {
    server.use(
      http.get("/api/features", () =>
        HttpResponse.json({
          features: { teamCollaboration: true },
        }),
      ),
    );

    render(<SharedQuerySection {...buildProps()} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText("Team Folder")).toBeInTheDocument(),
    );
  });

  it("shows creator attribution on shared folder", async () => {
    server.use(
      http.get("/api/features", () =>
        HttpResponse.json({
          features: { teamCollaboration: true },
        }),
      ),
    );

    render(<SharedQuerySection {...buildProps()} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText("Team Folder")).toBeInTheDocument(),
    );

    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  it("shows Duplicate to Personal in context menu for shared queries", async () => {
    server.use(
      http.get("/api/features", () =>
        HttpResponse.json({
          features: { teamCollaboration: true },
        }),
      ),
    );

    render(<SharedQuerySection {...buildProps()} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText("Team Folder")).toBeInTheDocument(),
    );

    // Expand folder
    fireEvent.click(screen.getByText("Team Folder"));

    await waitFor(() =>
      expect(screen.getByText("Shared Query")).toBeInTheDocument(),
    );

    // Right-click on a shared query
    fireEvent.contextMenu(screen.getByText("Shared Query"));

    await waitFor(() => {
      expect(screen.getByText("Duplicate to Personal")).toBeInTheDocument();
    });
  });

  it("shows Link to Query Activity in context menu for unlinked shared queries", async () => {
    server.use(
      http.get("/api/features", () =>
        HttpResponse.json({
          features: { teamCollaboration: true },
        }),
      ),
    );

    render(<SharedQuerySection {...buildProps()} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText("Team Folder")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("Team Folder"));

    await waitFor(() =>
      expect(screen.getByText("Unlinked Shared Query")).toBeInTheDocument(),
    );

    fireEvent.contextMenu(screen.getByText("Unlinked Shared Query"));

    await waitFor(() => {
      expect(screen.getByText("Link to Query Activity")).toBeInTheDocument();
    });
  });

  it("downgrade: shows shared content as read-only (no write actions)", async () => {
    // teamCollaboration is false but there IS shared content (downgrade scenario)
    render(<SharedQuerySection {...buildProps()} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText("Team Folder")).toBeInTheDocument(),
    );

    // Expand folder
    fireEvent.click(screen.getByText("Team Folder"));

    await waitFor(() =>
      expect(screen.getByText("Shared Query")).toBeInTheDocument(),
    );

    // Right-click on shared query
    fireEvent.contextMenu(screen.getByText("Shared Query"));

    // In read-only mode: Rename, Delete, Move to Folder, Link should NOT be shown
    // But Duplicate to Personal and View Run History should still be available
    await waitFor(() => {
      expect(screen.getByText("Duplicate to Personal")).toBeInTheDocument();
    });
    expect(screen.queryByText("Rename")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("downgrade: allows opening/viewing shared queries", async () => {
    const onSelectQuery = vi.fn();

    render(<SharedQuerySection {...buildProps({ onSelectQuery })} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText("Team Folder")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("Team Folder"));

    await waitFor(() =>
      expect(screen.getByText("Shared Query")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("Shared Query"));

    expect(onSelectQuery).toHaveBeenCalledWith("sq1");
  });

  it("shows New Shared Folder button when teamCollaboration is enabled", async () => {
    server.use(
      http.get("/api/features", () =>
        HttpResponse.json({
          features: { teamCollaboration: true },
        }),
      ),
    );

    render(<SharedQuerySection {...buildProps()} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByTitle("New Shared Folder")).toBeInTheDocument(),
    );
  });
});
