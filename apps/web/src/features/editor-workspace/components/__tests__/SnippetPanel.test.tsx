import type { SnippetListItem } from "@qpp/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BUILT_IN_SNIPPETS } from "@/features/editor-workspace/constants/built-in-snippets";
import { featuresQueryKeys } from "@/hooks/use-tenant-features";
import { server } from "@/test/mocks/server";
import { createTenantFeaturesStub } from "@/test/stubs";

import { SnippetPanel } from "../SnippetPanel";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSetActiveView = vi.fn();

vi.mock("@/features/editor-workspace/store/activity-bar-store", () => ({
  useActivityBarStore: (
    selector: (state: { setActiveView: typeof mockSetActiveView }) => unknown,
  ) => selector({ setActiveView: mockSetActiveView }),
}));

// Monaco is not available in jsdom — the SnippetModal embeds it but we only
// test the SnippetPanel here (modal is passed externally via snippetModalState).
// No modal is rendered in these tests so no Monaco mock is needed.

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
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

function seedProTier(queryClient: QueryClient) {
  queryClient.setQueryData(
    featuresQueryKeys.tenant(),
    createTenantFeaturesStub({ tier: "pro" }),
  );
}

function seedFreeTier(queryClient: QueryClient) {
  queryClient.setQueryData(
    featuresQueryKeys.tenant(),
    createTenantFeaturesStub({ tier: "free" }),
  );
}

const mockUserSnippet: SnippetListItem = {
  id: "user-snip-1",
  title: "My Custom Snippet",
  triggerPrefix: "custom",
  code: "SELECT * FROM [MyDE]",
  description: "A user-created snippet",
  scope: "bu",
  createdByUserName: "Alice",
  updatedByUserName: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SnippetPanel", () => {
  beforeEach(() => {
    // Default: GET /api/snippets returns empty array
    server.use(http.get("/api/snippets", () => HttpResponse.json([])));
    vi.clearAllMocks();
  });

  describe("Built-in snippets rendering", () => {
    it("renders the built-in section header", async () => {
      const queryClient = createQueryClient();
      seedFreeTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      expect(screen.getByText("Built-in")).toBeInTheDocument();
    });

    it("shows all built-in snippets on free tier with pro ones blurred", async () => {
      const queryClient = createQueryClient();
      seedFreeTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      // All 10 built-in snippets are visible (free ones normal, pro ones blurred)
      for (const snippet of BUILT_IN_SNIPPETS) {
        expect(
          await screen.findByText(snippet.triggerPrefix),
        ).toBeInTheDocument();
      }
    });

    it("shows all built-in snippets on pro tier", async () => {
      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      for (const snippet of BUILT_IN_SNIPPETS) {
        expect(
          await screen.findByText(snippet.triggerPrefix),
        ).toBeInTheDocument();
      }
    });

    it("renders built-in snippet titles alongside trigger prefixes", async () => {
      const queryClient = createQueryClient();
      seedFreeTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      const freeSnippets = BUILT_IN_SNIPPETS.filter(
        (s) => s.category === "free",
      );
      for (const snippet of freeSnippets) {
        expect(await screen.findByText(snippet.title)).toBeInTheDocument();
      }
    });
  });

  describe("User snippets rendering", () => {
    it("shows My Snippets section header", async () => {
      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      expect(screen.getByText("My Snippets")).toBeInTheDocument();
    });

    it("shows user snippet when API returns one (pro tier)", async () => {
      server.use(
        http.get("/api/snippets", () => HttpResponse.json([mockUserSnippet])),
      );

      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      expect(
        await screen.findByText(mockUserSnippet.title),
      ).toBeInTheDocument();
      expect(
        await screen.findByText(mockUserSnippet.triggerPrefix),
      ).toBeInTheDocument();
    });

    it("shows 'No snippets yet' when user has no snippets (pro tier)", async () => {
      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      expect(await screen.findByText(/No snippets yet/i)).toBeInTheDocument();
    });

    it("shows upgrade prompt (FeatureGate lock) in My Snippets section on free tier", async () => {
      const queryClient = createQueryClient();
      seedFreeTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      // FeatureGate renders an upgrade button when feature is locked
      const upgradeButton = await screen.findByRole("button", {
        name: /pro feature/i,
      });
      expect(upgradeButton).toBeInTheDocument();
    });
  });

  describe("Search filtering", () => {
    it("filters built-in snippets when user types in the search box", async () => {
      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      // All built-in snippets visible initially
      expect(await screen.findByText("sel")).toBeInTheDocument();
      expect(screen.getByText("dedup")).toBeInTheDocument();

      // Type in search box
      const searchInput = screen.getByPlaceholderText("Search snippets...");
      await userEvent.type(searchInput, "dedup");

      // Only dedup should remain visible (Fuse.js fuzzy match)
      await waitFor(() => {
        expect(screen.getByText("dedup")).toBeInTheDocument();
      });
      // sel should be filtered out
      await waitFor(() => {
        expect(screen.queryByText("sel")).not.toBeInTheDocument();
      });
    });

    it("filters user snippets by title when searching", async () => {
      server.use(
        http.get("/api/snippets", () => HttpResponse.json([mockUserSnippet])),
      );

      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      // User snippet visible initially
      expect(
        await screen.findByText(mockUserSnippet.title),
      ).toBeInTheDocument();

      // Search for something unrelated
      const searchInput = screen.getByPlaceholderText("Search snippets...");
      await userEvent.type(searchInput, "zzznomatch");

      await waitFor(() => {
        expect(
          screen.queryByText(mockUserSnippet.title),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Snippet selection and preview", () => {
    it("shows code preview when a built-in snippet is clicked", async () => {
      const queryClient = createQueryClient();
      seedFreeTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      const selSnippet = BUILT_IN_SNIPPETS.find(
        (s) => s.triggerPrefix === "sel",
      );
      if (!selSnippet) {
        throw new Error("Expected 'sel' built-in snippet to exist");
      }

      // Click on the sel snippet row
      const snippetButton = await screen.findByTitle(selSnippet.description);
      fireEvent.click(snippetButton);

      // Preview should show stripped body (tab-stops removed) in a pre element
      await waitFor(() => {
        const pre = document.querySelector("pre");
        expect(pre).toBeInTheDocument();
        expect(pre?.textContent).toContain("SELECT");
      });
    });

    it("calls onInsertSnippet with body when built-in snippet is double-clicked", async () => {
      const onInsertSnippet = vi.fn();
      const queryClient = createQueryClient();
      seedFreeTier(queryClient);

      render(<SnippetPanel onInsertSnippet={onInsertSnippet} />, {
        wrapper: createWrapper(queryClient),
      });

      const selSnippet = BUILT_IN_SNIPPETS.find(
        (s) => s.triggerPrefix === "sel",
      );
      if (!selSnippet) {
        throw new Error("Expected 'sel' built-in snippet to exist");
      }

      const snippetButton = await screen.findByTitle(selSnippet.description);
      fireEvent.dblClick(snippetButton);

      expect(onInsertSnippet).toHaveBeenCalledWith(selSnippet.body);
    });

    it("calls onInsertSnippet with code when user snippet is double-clicked", async () => {
      server.use(
        http.get("/api/snippets", () => HttpResponse.json([mockUserSnippet])),
      );

      const onInsertSnippet = vi.fn();
      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel onInsertSnippet={onInsertSnippet} />, {
        wrapper: createWrapper(queryClient),
      });

      const snippetButton = await screen.findByTitle(
        mockUserSnippet.description ?? mockUserSnippet.title,
      );
      fireEvent.dblClick(snippetButton);

      expect(onInsertSnippet).toHaveBeenCalledWith(mockUserSnippet.code);
    });
  });

  describe("Context menu actions", () => {
    it("shows Edit and Delete options on right-click of user snippet", async () => {
      server.use(
        http.get("/api/snippets", () => HttpResponse.json([mockUserSnippet])),
      );

      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      const snippetButton = await screen.findByTitle(
        mockUserSnippet.description ?? mockUserSnippet.title,
      );
      fireEvent.contextMenu(snippetButton);

      await waitFor(() => {
        expect(screen.getByText("Edit")).toBeInTheDocument();
        expect(screen.getByText("Delete")).toBeInTheDocument();
      });
    });

    it("shows Duplicate option on right-click of built-in snippet", async () => {
      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      const selSnippet = BUILT_IN_SNIPPETS.find(
        (s) => s.triggerPrefix === "sel",
      );
      if (!selSnippet) {
        throw new Error("Expected 'sel' built-in snippet to exist");
      }
      const snippetButton = await screen.findByTitle(selSnippet.description);
      fireEvent.contextMenu(snippetButton);

      await waitFor(() => {
        expect(screen.getByText("Duplicate")).toBeInTheDocument();
      });
    });

    it("calls onOpenEditModal when Edit is selected from context menu", async () => {
      server.use(
        http.get("/api/snippets", () => HttpResponse.json([mockUserSnippet])),
      );

      const onOpenEditModal = vi.fn();
      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel onOpenEditModal={onOpenEditModal} />, {
        wrapper: createWrapper(queryClient),
      });

      const snippetButton = await screen.findByTitle(
        mockUserSnippet.description ?? mockUserSnippet.title,
      );
      fireEvent.contextMenu(snippetButton);

      const editItem = await screen.findByText("Edit");
      fireEvent.click(editItem);

      await waitFor(() => {
        expect(onOpenEditModal).toHaveBeenCalledWith(
          mockUserSnippet.id,
          expect.objectContaining({
            title: mockUserSnippet.title,
            triggerPrefix: mockUserSnippet.triggerPrefix,
            code: mockUserSnippet.code,
          }),
        );
      });
    });

    it("shows delete confirmation when Delete is selected from context menu", async () => {
      server.use(
        http.get("/api/snippets", () => HttpResponse.json([mockUserSnippet])),
      );

      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      const snippetButton = await screen.findByTitle(
        mockUserSnippet.description ?? mockUserSnippet.title,
      );
      fireEvent.contextMenu(snippetButton);

      const deleteItem = await screen.findByText("Delete");
      fireEvent.click(deleteItem);

      await waitFor(() => {
        expect(
          screen.getByText(/are you sure you want to delete/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("New Snippet button", () => {
    it("shows New Snippet button on pro tier", async () => {
      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      expect(await screen.findByText("New Snippet")).toBeInTheDocument();
    });

    it("hides New Snippet button on free tier", async () => {
      const queryClient = createQueryClient();
      seedFreeTier(queryClient);

      render(<SnippetPanel />, { wrapper: createWrapper(queryClient) });

      // Give it time to settle
      await waitFor(() => {
        expect(screen.queryByText("New Snippet")).not.toBeInTheDocument();
      });
    });

    it("calls onOpenCreateModal when New Snippet is clicked", async () => {
      const onOpenCreateModal = vi.fn();
      const queryClient = createQueryClient();
      seedProTier(queryClient);

      render(<SnippetPanel onOpenCreateModal={onOpenCreateModal} />, {
        wrapper: createWrapper(queryClient),
      });

      const newButton = await screen.findByText("New Snippet");
      fireEvent.click(newButton);

      expect(onOpenCreateModal).toHaveBeenCalledTimes(1);
    });
  });
});
