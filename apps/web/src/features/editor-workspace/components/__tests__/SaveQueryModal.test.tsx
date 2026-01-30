import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { SaveQueryModal } from "../SaveQueryModal";

// Mock tier hook to control tier in tests
vi.mock("@/hooks/use-tier", () => ({
  useTier: vi.fn(() => ({ tier: "free", isLoading: false })),
  useSavedQueryLimit: vi.fn(() => 5),
}));

// Import after mock to get the mocked version
import { useSavedQueryLimit, useTier } from "@/hooks/use-tier";

const mockUseTier = vi.mocked(useTier);
const mockUseSavedQueryLimit = vi.mocked(useSavedQueryLimit);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper() {
  const queryClient = createQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

describe("SaveQueryModal", () => {
  beforeEach(() => {
    // Reset mocks
    mockUseTier.mockReturnValue({ tier: "free", isLoading: false });
    mockUseSavedQueryLimit.mockReturnValue(5);

    // Set up default API handlers
    server.use(
      http.get("/api/saved-queries/count", () =>
        HttpResponse.json({ count: 2 }),
      ),
      http.get("/api/saved-queries", () =>
        HttpResponse.json([
          {
            id: "existing-1",
            name: "Existing Query",
            folderId: null,
            updatedAt: new Date().toISOString(),
          },
          {
            id: "existing-2",
            name: "Another Query",
            folderId: null,
            updatedAt: new Date().toISOString(),
          },
        ]),
      ),
      http.get("/api/folders", () =>
        HttpResponse.json([
          { id: "folder-1", name: "My Queries", parentId: null },
          { id: "folder-2", name: "Shared Queries", parentId: null },
        ]),
      ),
      http.post("/api/saved-queries", async ({ request }) => {
        const body = (await request.json()) as {
          name: string;
          sqlText: string;
        };
        return HttpResponse.json(
          {
            id: "new-query-id",
            name: body.name,
            sqlText: body.sqlText,
            folderId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { status: 201 },
        );
      }),
    );
  });

  describe("quota enforcement", () => {
    it("shows quota count for free tier users", async () => {
      render(
        <SaveQueryModal isOpen={true} content="SELECT 1" onClose={vi.fn()} />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByText(/Saved Queries.*2\/5/)).toBeInTheDocument();
      });
    });

    it("blocks save when at quota limit", async () => {
      server.use(
        http.get("/api/saved-queries/count", () =>
          HttpResponse.json({ count: 5 }),
        ),
      );

      render(
        <SaveQueryModal isOpen={true} content="SELECT 1" onClose={vi.fn()} />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByText(/Limit Reached/)).toBeInTheDocument();
        expect(screen.getByText(/Upgrade to Pro/)).toBeInTheDocument();
      });
    });

    it("shows warning when near quota", async () => {
      server.use(
        http.get("/api/saved-queries/count", () =>
          HttpResponse.json({ count: 4 }),
        ),
      );

      render(
        <SaveQueryModal isOpen={true} content="SELECT 1" onClose={vi.fn()} />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByText(/Almost at limit/)).toBeInTheDocument();
      });
    });

    it("allows unlimited queries for Pro users", async () => {
      mockUseTier.mockReturnValue({ tier: "pro", isLoading: false });
      mockUseSavedQueryLimit.mockReturnValue(null);

      server.use(
        http.get("/api/saved-queries/count", () =>
          HttpResponse.json({ count: 100 }),
        ),
      );

      render(
        <SaveQueryModal isOpen={true} content="SELECT 1" onClose={vi.fn()} />,
        { wrapper: createWrapper() },
      );

      // Should NOT show quota count for Pro users
      await waitFor(() => {
        expect(screen.queryByText(/\/5/)).not.toBeInTheDocument();
      });

      // Should show the form, not blocked content
      expect(screen.getByLabelText(/query name/i)).toBeInTheDocument();
    });
  });

  describe("folder selector", () => {
    it("shows folder selector locked message for free users", async () => {
      render(
        <SaveQueryModal isOpen={true} content="SELECT 1" onClose={vi.fn()} />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Folders available in Pro/),
        ).toBeInTheDocument();
      });
    });

    it("shows folder dropdown for Pro users", async () => {
      mockUseTier.mockReturnValue({ tier: "pro", isLoading: false });
      mockUseSavedQueryLimit.mockReturnValue(null);

      render(
        <SaveQueryModal isOpen={true} content="SELECT 1" onClose={vi.fn()} />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/target folder/i)).toBeInTheDocument();
      });

      // Should have folder options
      expect(
        screen.getByRole("option", { name: "No folder" }),
      ).toBeInTheDocument();
    });
  });

  describe("form validation", () => {
    it("disables save button when name is empty", async () => {
      render(
        <SaveQueryModal
          isOpen={true}
          content="SELECT 1"
          initialName=""
          onClose={vi.fn()}
        />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        const saveButton = screen.getByRole("button", {
          name: /save to workspace/i,
        });
        expect(saveButton).toBeDisabled();
      });
    });

    it("disables save button when name is whitespace only", async () => {
      const user = userEvent.setup();

      render(
        <SaveQueryModal
          isOpen={true}
          content="SELECT 1"
          initialName=""
          onClose={vi.fn()}
        />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/query name/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/query name/i);
      await user.type(nameInput, "   ");

      const saveButton = screen.getByRole("button", {
        name: /save to workspace/i,
      });
      expect(saveButton).toBeDisabled();
    });
  });

  describe("save flow", () => {
    it("saves query and calls onSaveSuccess", async () => {
      const user = userEvent.setup();
      const onSaveSuccess = vi.fn();
      const onClose = vi.fn();

      render(
        <SaveQueryModal
          isOpen={true}
          content="SELECT 1"
          initialName=""
          onClose={onClose}
          onSaveSuccess={onSaveSuccess}
        />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/query name/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/query name/i), "My New Query");
      await user.click(
        screen.getByRole("button", { name: /save to workspace/i }),
      );

      await waitFor(() => {
        expect(onSaveSuccess).toHaveBeenCalledWith(
          "new-query-id",
          "My New Query",
        );
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("trims query name before saving", async () => {
      const user = userEvent.setup();
      let capturedBody: { name: string } | null = null;

      server.use(
        http.post("/api/saved-queries", async ({ request }) => {
          capturedBody = (await request.json()) as { name: string };
          return HttpResponse.json(
            {
              id: "new-query-id",
              name: capturedBody.name,
              sqlText: "SELECT 1",
              folderId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            { status: 201 },
          );
        }),
      );

      render(
        <SaveQueryModal
          isOpen={true}
          content="SELECT 1"
          initialName=""
          onClose={vi.fn()}
          onSaveSuccess={vi.fn()}
        />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/query name/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/query name/i), "  Trimmed Name  ");
      await user.click(
        screen.getByRole("button", { name: /save to workspace/i }),
      );

      await waitFor(() => {
        expect(capturedBody?.name).toBe("Trimmed Name");
      });
    });

    it("shows loading state while saving", async () => {
      const user = userEvent.setup();

      // Delay the response to see loading state
      server.use(
        http.post("/api/saved-queries", async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return HttpResponse.json(
            {
              id: "new-query-id",
              name: "Test",
              sqlText: "SELECT 1",
              folderId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            { status: 201 },
          );
        }),
      );

      render(
        <SaveQueryModal
          isOpen={true}
          content="SELECT 1"
          initialName="Test"
          onClose={vi.fn()}
        />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/query name/i)).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /save to workspace/i }),
      );

      // Should show "Saving..." while request is in flight
      expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    });
  });

  describe("duplicate name warning", () => {
    it("shows warning when name matches existing query (case-insensitive)", async () => {
      const user = userEvent.setup();

      render(
        <SaveQueryModal isOpen={true} content="SELECT 1" onClose={vi.fn()} />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/query name/i)).toBeInTheDocument();
      });

      // Type duplicate name in lowercase to test case-insensitivity
      await user.type(screen.getByLabelText(/query name/i), "existing query");

      await waitFor(() => {
        expect(
          screen.getByText(/a query with this name already exists/i),
        ).toBeInTheDocument();
      });
    });

    it("allows saving with duplicate name (non-blocking warning)", async () => {
      const user = userEvent.setup();
      const onSaveSuccess = vi.fn();
      const onClose = vi.fn();

      render(
        <SaveQueryModal
          isOpen={true}
          content="SELECT 1"
          onClose={onClose}
          onSaveSuccess={onSaveSuccess}
        />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/query name/i)).toBeInTheDocument();
      });

      // Type exact duplicate name
      await user.type(screen.getByLabelText(/query name/i), "Existing Query");

      // Warning should be visible
      await waitFor(() => {
        expect(
          screen.getByText(/a query with this name already exists/i),
        ).toBeInTheDocument();
      });

      // Save button should NOT be disabled due to warning (only disabled if empty)
      const saveButton = screen.getByRole("button", {
        name: /save to workspace/i,
      });
      expect(saveButton).not.toBeDisabled();

      // Click save
      await user.click(saveButton);

      // Save should proceed despite warning
      await waitFor(() => {
        expect(onSaveSuccess).toHaveBeenCalledWith(
          "new-query-id",
          "Existing Query",
        );
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("warning disappears when name becomes unique", async () => {
      const user = userEvent.setup();

      render(
        <SaveQueryModal isOpen={true} content="SELECT 1" onClose={vi.fn()} />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/query name/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/query name/i);

      // Type duplicate name
      await user.type(nameInput, "Existing Query");

      // Warning should be visible
      await waitFor(() => {
        expect(
          screen.getByText(/a query with this name already exists/i),
        ).toBeInTheDocument();
      });

      // Clear and type unique name
      await user.clear(nameInput);
      await user.type(nameInput, "Unique Query Name");

      // Warning should disappear
      await waitFor(() => {
        expect(
          screen.queryByText(/a query with this name already exists/i),
        ).not.toBeInTheDocument();
      });
    });
  });
});
