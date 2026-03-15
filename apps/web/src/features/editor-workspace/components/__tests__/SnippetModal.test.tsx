import "@/test/mocks/monaco-editor-react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { SnippetModal } from "../SnippetModal";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/features/editor-workspace/utils/monaco-options", () => ({
  getEditorOptions: () => ({
    minimap: { enabled: false },
    lineNumbers: "off",
    scrollBeyondLastLine: false,
    wordWrap: "on",
    folding: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    glyphMargin: false,
  }),
  MONACO_THEME_NAME: "qs-pro-sql",
  applyMonacoTheme: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
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

const mockSnippetResponse = {
  id: "snip-new-1",
  title: "My Snippet",
  triggerPrefix: "mysnip",
  code: "SELECT 1",
  description: null,
  scope: "bu" as const,
  createdByUserName: null,
  updatedByUserName: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SnippetModal", () => {
  beforeEach(() => {
    server.use(
      http.post("/api/snippets", async () => {
        return HttpResponse.json(mockSnippetResponse, { status: 201 });
      }),
      http.patch("/api/snippets/:id", async () => {
        return HttpResponse.json({
          ...mockSnippetResponse,
          id: "snip-existing",
        });
      }),
      http.get("/api/snippets", () => HttpResponse.json([])),
    );
  });

  describe("Create mode", () => {
    it("renders empty form fields in create mode", () => {
      const queryClient = createQueryClient();

      render(
        <SnippetModal open={true} onOpenChange={vi.fn()} mode="create" />,
        { wrapper: createWrapper(queryClient) },
      );

      expect(screen.getByLabelText(/title/i)).toHaveValue("");
      expect(screen.getByLabelText(/trigger prefix/i)).toHaveValue("");
      expect(screen.getByText("New Snippet")).toBeInTheDocument();
    });

    it("shows 'New Snippet' dialog title in create mode", () => {
      const queryClient = createQueryClient();

      render(
        <SnippetModal open={true} onOpenChange={vi.fn()} mode="create" />,
        { wrapper: createWrapper(queryClient) },
      );

      expect(
        screen.getByRole("heading", { name: "New Snippet" }),
      ).toBeInTheDocument();
    });
  });

  describe("Edit mode", () => {
    it("pre-fills form fields from initialData in edit mode", () => {
      const queryClient = createQueryClient();

      render(
        <SnippetModal
          open={true}
          onOpenChange={vi.fn()}
          mode="edit"
          snippetId="snip-1"
          initialData={{
            title: "My Existing Snippet",
            triggerPrefix: "existing",
            code: "SELECT EmailAddress FROM _Subscribers",
            description: "A test snippet",
            scope: "bu",
          }}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      expect(screen.getByLabelText(/title/i)).toHaveValue(
        "My Existing Snippet",
      );
      expect(screen.getByLabelText(/trigger prefix/i)).toHaveValue("existing");
      expect(
        screen.getByRole("heading", { name: "Edit Snippet" }),
      ).toBeInTheDocument();
    });
  });

  describe("Duplicate mode", () => {
    it("pre-fills form with provided title in duplicate mode", () => {
      const queryClient = createQueryClient();

      render(
        <SnippetModal
          open={true}
          onOpenChange={vi.fn()}
          mode="duplicate"
          initialData={{
            title: "Copy of My Snippet",
            triggerPrefix: "mysnip",
            code: "SELECT 1",
          }}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      expect(screen.getByLabelText(/title/i)).toHaveValue("Copy of My Snippet");
      expect(
        screen.getByRole("heading", { name: "Duplicate Snippet" }),
      ).toBeInTheDocument();
    });
  });

  describe("Validation", () => {
    it("shows title error when submitting with empty title", async () => {
      const user = userEvent.setup();
      const queryClient = createQueryClient();

      render(
        <SnippetModal open={true} onOpenChange={vi.fn()} mode="create" />,
        { wrapper: createWrapper(queryClient) },
      );

      // Fill prefix and code but leave title empty
      await user.type(screen.getByLabelText(/trigger prefix/i), "mysnip");

      // Type code into the mocked monaco textarea
      const monacoTextarea = screen.getByTestId("monaco-textarea");
      await user.type(monacoTextarea, "SELECT 1");

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText("Title is required")).toBeInTheDocument();
      });
    });

    it("shows prefix error when trigger prefix starts with a number", async () => {
      const user = userEvent.setup();
      const queryClient = createQueryClient();

      render(
        <SnippetModal open={true} onOpenChange={vi.fn()} mode="create" />,
        { wrapper: createWrapper(queryClient) },
      );

      await user.type(screen.getByLabelText(/title/i), "My Snippet");
      await user.type(screen.getByLabelText(/trigger prefix/i), "1badprefix");
      const monacoTextarea = screen.getByTestId("monaco-textarea");
      await user.type(monacoTextarea, "SELECT 1");

      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(
          screen.getByText(/must start with a letter/i),
        ).toBeInTheDocument();
      });
    });

    it("shows prefix error when trigger prefix contains special characters", async () => {
      const user = userEvent.setup();
      const queryClient = createQueryClient();

      render(
        <SnippetModal open={true} onOpenChange={vi.fn()} mode="create" />,
        { wrapper: createWrapper(queryClient) },
      );

      await user.type(screen.getByLabelText(/title/i), "My Snippet");
      await user.type(screen.getByLabelText(/trigger prefix/i), "bad-prefix!");
      const monacoTextarea = screen.getByTestId("monaco-textarea");
      await user.type(monacoTextarea, "SELECT 1");

      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(
          screen.getByText(/must start with a letter/i),
        ).toBeInTheDocument();
      });
    });

    it("shows code error when submitting with empty code", async () => {
      const user = userEvent.setup();
      const queryClient = createQueryClient();

      render(
        <SnippetModal open={true} onOpenChange={vi.fn()} mode="create" />,
        { wrapper: createWrapper(queryClient) },
      );

      await user.type(screen.getByLabelText(/title/i), "My Snippet");
      await user.type(screen.getByLabelText(/trigger prefix/i), "mysnip");
      // Leave code empty

      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(screen.getByText("SQL code is required")).toBeInTheDocument();
      });
    });
  });

  describe("Save behavior", () => {
    it("calls create mutation with correct data when submitting valid create form", async () => {
      const user = userEvent.setup();
      const queryClient = createQueryClient();
      let capturedBody: unknown = null;

      server.use(
        http.post("/api/snippets", async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(mockSnippetResponse, { status: 201 });
        }),
      );

      render(
        <SnippetModal open={true} onOpenChange={vi.fn()} mode="create" />,
        { wrapper: createWrapper(queryClient) },
      );

      await user.type(screen.getByLabelText(/title/i), "My New Snippet");
      await user.type(screen.getByLabelText(/trigger prefix/i), "newsnip");
      const monacoTextarea = screen.getByTestId("monaco-textarea");
      await user.type(monacoTextarea, "SELECT 1");

      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(capturedBody).toMatchObject({
          title: "My New Snippet",
          triggerPrefix: "newsnip",
          code: "SELECT 1",
        });
      });
    });

    it("closes modal (calls onOpenChange(false)) after successful create", async () => {
      const user = userEvent.setup();
      const queryClient = createQueryClient();
      const onOpenChange = vi.fn();

      render(
        <SnippetModal open={true} onOpenChange={onOpenChange} mode="create" />,
        { wrapper: createWrapper(queryClient) },
      );

      await user.type(screen.getByLabelText(/title/i), "Test Snippet");
      await user.type(screen.getByLabelText(/trigger prefix/i), "testsnip");
      const monacoTextarea = screen.getByTestId("monaco-textarea");
      await user.type(monacoTextarea, "SELECT 1");

      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("calls update mutation in edit mode and closes modal on success", async () => {
      const user = userEvent.setup();
      const queryClient = createQueryClient();
      const onOpenChange = vi.fn();
      let capturedPatchBody: unknown = null;

      server.use(
        http.patch("/api/snippets/:id", async ({ request }) => {
          capturedPatchBody = await request.json();
          return HttpResponse.json({ ...mockSnippetResponse, id: "snip-1" });
        }),
      );

      render(
        <SnippetModal
          open={true}
          onOpenChange={onOpenChange}
          mode="edit"
          snippetId="snip-1"
          initialData={{
            title: "Old Title",
            triggerPrefix: "old",
            code: "SELECT 1",
            scope: "bu",
          }}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      // Clear title and type new one
      const titleInput = screen.getByLabelText(/title/i);
      await user.clear(titleInput);
      await user.type(titleInput, "New Title");

      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(capturedPatchBody).toMatchObject({ title: "New Title" });
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("closes modal when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      const queryClient = createQueryClient();
      const onOpenChange = vi.fn();

      render(
        <SnippetModal open={true} onOpenChange={onOpenChange} mode="create" />,
        { wrapper: createWrapper(queryClient) },
      );

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
