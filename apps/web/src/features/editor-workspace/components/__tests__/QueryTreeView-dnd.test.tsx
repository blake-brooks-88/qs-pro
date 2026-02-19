import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { QueryTreeView } from "../QueryTreeView";

type DndContextProps = {
  onDragStart?: (event: unknown) => void;
  onDragEnd?: (event: unknown) => void;
  children: ReactNode;
};

let latestDndContextProps: DndContextProps | null = null;

vi.mock("@dnd-kit/core", () => {
  return {
    DndContext: (props: DndContextProps) => {
      latestDndContextProps = props;
      return <div data-testid="dnd-context">{props.children}</div>;
    },
    DragOverlay: ({ children }: { children: ReactNode }) => {
      return <div data-testid="drag-overlay">{children}</div>;
    },
    PointerSensor: class PointerSensor {},
    useSensor: () => ({}),
    useSensors: (...sensors: unknown[]) => sensors,
    useDraggable: () => {
      return {
        attributes: {},
        listeners: {},
        setNodeRef: () => {},
        isDragging: false,
      };
    },
    useDroppable: () => {
      return { setNodeRef: () => {}, isOver: false };
    },
  };
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
  return { queryClient, TestWrapper };
}

describe("QueryTreeView drag-and-drop behavior", () => {
  beforeEach(() => {
    latestDndContextProps = null;
  });

  it("does nothing when a drag ends without a drop target", async () => {
    const { TestWrapper } = createWrapper();

    server.use(
      http.get("/api/folders", () => HttpResponse.json([])),
      http.get("/api/saved-queries", () =>
        HttpResponse.json([
          {
            id: "q1",
            name: "Query One",
            folderId: null,
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
    );

    let patchCount = 0;
    server.use(
      http.patch("/api/saved-queries/:id", () => {
        patchCount += 1;
        return HttpResponse.json({});
      }),
    );

    render(<QueryTreeView searchQuery="" onSelectQuery={() => {}} />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("Query One")).toBeInTheDocument();
      expect(latestDndContextProps).not.toBeNull();
    });

    act(() => {
      latestDndContextProps?.onDragStart?.({
        active: { id: "query-q1" },
      });
    });

    act(() => {
      latestDndContextProps?.onDragEnd?.({
        active: { id: "query-q1" },
        over: null,
      });
    });

    await new Promise((r) => setTimeout(r, 25));
    expect(patchCount).toBe(0);
  });

  it("moves a query into a folder when dropped on a folder", async () => {
    const { TestWrapper } = createWrapper();

    server.use(
      http.get("/api/folders", () =>
        HttpResponse.json([
          {
            id: "f1",
            name: "Folder A",
            parentId: null,
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
      http.get("/api/saved-queries", () =>
        HttpResponse.json([
          {
            id: "q1",
            name: "Query One",
            folderId: null,
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
    );

    let patchBody: unknown = null;
    server.use(
      http.patch("/api/saved-queries/:id", async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({
          id: "q1",
          name: "Query One",
          folderId:
            (patchBody as { folderId?: string | null }).folderId ?? null,
          updatedAt: "2026-02-19T00:00:00.000Z",
        });
      }),
    );

    render(<QueryTreeView searchQuery="" onSelectQuery={() => {}} />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("Query One")).toBeInTheDocument();
      expect(latestDndContextProps).not.toBeNull();
    });

    act(() => {
      latestDndContextProps?.onDragStart?.({
        active: { id: "query-q1" },
      });
    });

    act(() => {
      latestDndContextProps?.onDragEnd?.({
        active: { id: "query-q1" },
        over: { id: "f1" },
      });
    });

    await waitFor(() => {
      expect(patchBody).toEqual({ folderId: "f1" });
    });
  });

  it("moves a query back to root when dropped on the root drop zone (even if there are no root queries)", async () => {
    const { TestWrapper } = createWrapper();

    server.use(
      http.get("/api/folders", () =>
        HttpResponse.json([
          {
            id: "f1",
            name: "Folder A",
            parentId: null,
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
      http.get("/api/saved-queries", () =>
        HttpResponse.json([
          {
            id: "q1",
            name: "Query One",
            folderId: "f1",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
    );

    let patchBody: unknown = null;
    server.use(
      http.patch("/api/saved-queries/:id", async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({
          id: "q1",
          name: "Query One",
          folderId:
            (patchBody as { folderId?: string | null }).folderId ?? null,
          updatedAt: "2026-02-19T00:00:00.000Z",
        });
      }),
    );

    render(<QueryTreeView searchQuery="" onSelectQuery={() => {}} />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("Folder A")).toBeInTheDocument();
      expect(latestDndContextProps).not.toBeNull();
    });

    act(() => {
      latestDndContextProps?.onDragStart?.({
        active: { id: "query-q1" },
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Root drop zone")).toBeInTheDocument();
      expect(screen.getByText("Drop here to move to root")).toBeInTheDocument();
    });

    act(() => {
      latestDndContextProps?.onDragEnd?.({
        active: { id: "query-q1" },
        over: { id: "__root__" },
      });
    });

    await waitFor(() => {
      expect(patchBody).toEqual({ folderId: null });
    });
  });

  it("does not move a query into an optimistic folder", async () => {
    const { TestWrapper } = createWrapper();

    server.use(
      http.get("/api/folders", () =>
        HttpResponse.json([
          {
            id: "temp-123",
            name: "Optimistic Folder",
            parentId: null,
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
      http.get("/api/saved-queries", () =>
        HttpResponse.json([
          {
            id: "q1",
            name: "Query One",
            folderId: null,
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
    );

    let patchCount = 0;
    server.use(
      http.patch("/api/saved-queries/:id", () => {
        patchCount += 1;
        return HttpResponse.json({});
      }),
    );

    render(<QueryTreeView searchQuery="" onSelectQuery={() => {}} />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("Query One")).toBeInTheDocument();
      expect(latestDndContextProps).not.toBeNull();
    });

    act(() => {
      latestDndContextProps?.onDragStart?.({
        active: { id: "query-q1" },
      });
    });

    act(() => {
      latestDndContextProps?.onDragEnd?.({
        active: { id: "query-q1" },
        over: { id: "temp-123" },
      });
    });

    await new Promise((r) => setTimeout(r, 25));
    expect(patchCount).toBe(0);
  });

  it("moves a folder into another folder when dropped on a folder", async () => {
    const { TestWrapper } = createWrapper();

    server.use(
      http.get("/api/folders", () =>
        HttpResponse.json([
          {
            id: "f1",
            name: "Folder A",
            parentId: null,
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
          {
            id: "f2",
            name: "Folder B",
            parentId: null,
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
      http.get("/api/saved-queries", () => HttpResponse.json([])),
    );

    let patchBody: unknown = null;
    server.use(
      http.patch("/api/folders/:id", async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patchBody = { id: String(params.id), ...body };
        return HttpResponse.json({
          id: String(params.id),
          name: String(params.id) === "f2" ? "Folder B" : "Folder A",
          parentId:
            (patchBody as { parentId?: string | null }).parentId ?? null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        });
      }),
    );

    render(<QueryTreeView searchQuery="" onSelectQuery={() => {}} />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("Folder A")).toBeInTheDocument();
      expect(screen.getByText("Folder B")).toBeInTheDocument();
      expect(latestDndContextProps).not.toBeNull();
    });

    act(() => {
      latestDndContextProps?.onDragStart?.({
        active: { id: "folder-f2" },
      });
    });

    act(() => {
      latestDndContextProps?.onDragEnd?.({
        active: { id: "folder-f2" },
        over: { id: "f1" },
      });
    });

    await waitFor(() => {
      expect(patchBody).toEqual({ id: "f2", parentId: "f1" });
    });
  });

  it("does not move a folder into its own descendant", async () => {
    const { TestWrapper } = createWrapper();

    server.use(
      http.get("/api/folders", () =>
        HttpResponse.json([
          {
            id: "f1",
            name: "Folder A",
            parentId: null,
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
          {
            id: "f3",
            name: "Nested Folder",
            parentId: "f1",
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
      http.get("/api/saved-queries", () => HttpResponse.json([])),
    );

    let patchCount = 0;
    server.use(
      http.patch("/api/folders/:id", () => {
        patchCount += 1;
        return HttpResponse.json({});
      }),
    );

    render(<QueryTreeView searchQuery="" onSelectQuery={() => {}} />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("Folder A")).toBeInTheDocument();
      expect(latestDndContextProps).not.toBeNull();
    });

    act(() => {
      latestDndContextProps?.onDragStart?.({
        active: { id: "folder-f1" },
      });
    });

    act(() => {
      latestDndContextProps?.onDragEnd?.({
        active: { id: "folder-f1" },
        over: { id: "f3" },
      });
    });

    await new Promise((r) => setTimeout(r, 25));
    expect(patchCount).toBe(0);
  });

  it("does not move a folder into itself", async () => {
    const { TestWrapper } = createWrapper();

    server.use(
      http.get("/api/folders", () =>
        HttpResponse.json([
          {
            id: "f1",
            name: "Folder A",
            parentId: null,
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
      http.get("/api/saved-queries", () => HttpResponse.json([])),
    );

    let patchCount = 0;
    server.use(
      http.patch("/api/folders/:id", () => {
        patchCount += 1;
        return HttpResponse.json({});
      }),
    );

    render(<QueryTreeView searchQuery="" onSelectQuery={() => {}} />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("Folder A")).toBeInTheDocument();
      expect(latestDndContextProps).not.toBeNull();
    });

    act(() => {
      latestDndContextProps?.onDragStart?.({
        active: { id: "folder-f1" },
      });
    });

    act(() => {
      latestDndContextProps?.onDragEnd?.({
        active: { id: "folder-f1" },
        over: { id: "f1" },
      });
    });

    await new Promise((r) => setTimeout(r, 25));
    expect(patchCount).toBe(0);
  });

  it("moves a folder back to root when dropped on the root drop zone", async () => {
    const { TestWrapper } = createWrapper();

    server.use(
      http.get("/api/folders", () =>
        HttpResponse.json([
          {
            id: "f1",
            name: "Folder A",
            parentId: null,
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
          {
            id: "f2",
            name: "Folder B",
            parentId: "f1",
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
      http.get("/api/saved-queries", () => HttpResponse.json([])),
    );

    let patchBody: unknown = null;
    server.use(
      http.patch("/api/folders/:id", async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patchBody = { id: String(params.id), ...body };
        return HttpResponse.json({
          id: String(params.id),
          name: String(params.id) === "f2" ? "Folder B" : "Folder A",
          parentId:
            (patchBody as { parentId?: string | null }).parentId ?? null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        });
      }),
    );

    render(<QueryTreeView searchQuery="" onSelectQuery={() => {}} />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("Folder A")).toBeInTheDocument();
      expect(latestDndContextProps).not.toBeNull();
    });

    act(() => {
      latestDndContextProps?.onDragStart?.({
        active: { id: "folder-f2" },
      });
    });

    act(() => {
      latestDndContextProps?.onDragEnd?.({
        active: { id: "folder-f2" },
        over: { id: "__root__" },
      });
    });

    await waitFor(() => {
      expect(patchBody).toEqual({ id: "f2", parentId: null });
    });
  });

  it("creates a folder from the New Folder inline input", async () => {
    const user = userEvent.setup();
    const { TestWrapper } = createWrapper();

    let folders: {
      id: string;
      name: string;
      parentId: string | null;
      createdAt: string;
      updatedAt: string;
    }[] = [];

    server.use(
      http.get("/api/folders", () => HttpResponse.json(folders)),
      http.get("/api/saved-queries", () => HttpResponse.json([])),
    );

    let postBody: unknown = null;
    server.use(
      http.post("/api/folders", async ({ request }) => {
        postBody = await request.json();
        const created = {
          id: "f-new",
          name: (postBody as { name: string }).name,
          parentId: null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        };
        folders = [created];
        return HttpResponse.json(created);
      }),
    );

    render(<QueryTreeView searchQuery="" onSelectQuery={() => {}} />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("New Folder"));

    const input = await screen.findByRole("textbox");
    await user.type(input, "New Folder{enter}");

    await waitFor(() => {
      expect(postBody).toEqual({ name: "New Folder", parentId: null });
      expect(screen.getByText("New Folder")).toBeInTheDocument();
    });
  });

  it("renames a folder from the context menu and sends the update request", async () => {
    const user = userEvent.setup();
    const { TestWrapper } = createWrapper();

    let folders: {
      id: string;
      name: string;
      parentId: string | null;
      createdAt: string;
      updatedAt: string;
    }[] = [
      {
        id: "f1",
        name: "Folder A",
        parentId: null,
        createdAt: "2026-02-19T00:00:00.000Z",
        updatedAt: "2026-02-19T00:00:00.000Z",
      },
    ];

    server.use(
      http.get("/api/folders", () => HttpResponse.json(folders)),
      http.get("/api/saved-queries", () => HttpResponse.json([])),
    );

    let patchBody: unknown = null;
    server.use(
      http.patch("/api/folders/:id", async ({ request }) => {
        patchBody = await request.json();
        const name = (patchBody as { name: string }).name;
        folders = folders.map((f) => (f.id === "f1" ? { ...f, name } : f));
        return HttpResponse.json(folders[0]);
      }),
    );

    render(<QueryTreeView searchQuery="" onSelectQuery={() => {}} />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("Folder A")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByText("Folder A"));

    await waitFor(() => {
      expect(screen.getByText("Rename")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Rename"));
    const input = await screen.findByRole("textbox");
    await user.clear(input);
    await user.type(input, "Folder Renamed{enter}");

    await waitFor(() => {
      expect(patchBody).toEqual({ name: "Folder Renamed" });
      expect(screen.getByText("Folder Renamed")).toBeInTheDocument();
    });
  });

  it("supports unprefixed draggable ids when ending a drag", async () => {
    const { TestWrapper } = createWrapper();

    server.use(
      http.get("/api/folders", () =>
        HttpResponse.json([
          {
            id: "f1",
            name: "Folder A",
            parentId: null,
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
      http.get("/api/saved-queries", () =>
        HttpResponse.json([
          {
            id: "q1",
            name: "Query One",
            folderId: "f1",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
    );

    let patchBody: unknown = null;
    server.use(
      http.patch("/api/saved-queries/:id", async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({});
      }),
    );

    render(<QueryTreeView searchQuery="" onSelectQuery={() => {}} />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("Folder A")).toBeInTheDocument();
      expect(latestDndContextProps).not.toBeNull();
    });

    act(() => {
      latestDndContextProps?.onDragStart?.({
        active: { id: "q1" },
      });
    });

    act(() => {
      latestDndContextProps?.onDragEnd?.({
        active: { id: "q1" },
        over: { id: "__root__" },
      });
    });

    await waitFor(() => {
      expect(patchBody).toEqual({ folderId: null });
    });
  });
});
