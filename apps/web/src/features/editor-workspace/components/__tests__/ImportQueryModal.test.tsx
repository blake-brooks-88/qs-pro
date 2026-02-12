import type { QAListItem } from "@qpp/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { ImportQueryModal } from "../ImportQueryModal";

vi.mock("@/hooks/use-tier", () => ({
  useTier: () => ({ tier: mockTier, isLoading: false }),
}));

let mockTier = "free";

const mockQAs: QAListItem[] = [
  {
    objectId: "qa-obj-1",
    customerKey: "qa-key-1",
    name: "Weekly Subscribers",
    targetUpdateType: "Overwrite",
    targetDEName: "Subscriber_Weekly",
    modifiedDate: "2026-02-01T10:00:00Z",
    status: "Active",
    isLinked: false,
    linkedToQueryName: null,
  },
  {
    objectId: "qa-obj-2",
    customerKey: "qa-key-2",
    name: "Monthly Report",
    targetUpdateType: "Append",
    targetDEName: "Report_Monthly",
    modifiedDate: "2026-01-15T10:00:00Z",
    status: "Active",
    isLinked: true,
    linkedToQueryName: "My Linked Query",
  },
];

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

function createDefaultProps() {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onImportSaved: vi.fn(),
    onOpenInEditor: vi.fn(),
  };
}

describe("ImportQueryModal", () => {
  beforeEach(() => {
    mockTier = "free";

    server.use(
      http.get("/api/query-activities", () => {
        return HttpResponse.json(mockQAs);
      }),
      http.get("/api/query-activities/:customerKey", ({ params }) => {
        const qa = mockQAs.find((q) => q.customerKey === params.customerKey);
        return HttpResponse.json({
          objectId: qa?.objectId ?? `qa-obj-${params.customerKey}`,
          customerKey: params.customerKey,
          name: qa?.name ?? `QA ${params.customerKey}`,
          queryText: "SELECT SubscriberKey FROM [_Subscribers]",
          targetUpdateType: qa?.targetUpdateType ?? "Overwrite",
          isLinked: qa?.isLinked ?? false,
          linkedToQueryName: qa?.linkedToQueryName ?? null,
        });
      }),
    );
  });

  it("renders loading state when open", () => {
    server.use(
      http.get("/api/query-activities", async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json(mockQAs);
      }),
    );

    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    expect(screen.getByText("Loading Query Activities...")).toBeInTheDocument();
  });

  it("renders QA list with rich metadata", async () => {
    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument();
      expect(screen.getByText("Monthly Report")).toBeInTheDocument();
    });

    expect(screen.getByText("Subscriber_Weekly")).toBeInTheDocument();
    expect(screen.getByText("Overwrite")).toBeInTheDocument();
    expect(screen.getByText("Report_Monthly")).toBeInTheDocument();
    expect(screen.getByText("Append")).toBeInTheDocument();
  });

  it("filters QAs by search term", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    const searchInput = screen.getByPlaceholderText(/search query activities/i);
    await user.type(searchInput, "Monthly");

    expect(screen.getByText("Monthly Report")).toBeInTheDocument();
    expect(screen.queryByText("Weekly Subscribers")).not.toBeInTheDocument();

    await user.clear(searchInput);

    expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument();
    expect(screen.getByText("Monthly Report")).toBeInTheDocument();
  });

  it("shows empty state when no QAs match search", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    const searchInput = screen.getByPlaceholderText(/search query activities/i);
    await user.type(searchInput, "ZZZZZ");

    expect(
      screen.getByText("No matching Query Activities found"),
    ).toBeInTheDocument();
  });

  it("shows empty state when BU has no QAs", async () => {
    server.use(
      http.get("/api/query-activities", () => {
        return HttpResponse.json([]);
      }),
    );

    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(
        screen.getByText("No Query Activities found in this Business Unit"),
      ).toBeInTheDocument();
    });
  });

  it("shows action buttons after QA detail fetched", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Open in Editor")).toBeInTheDocument();
      expect(screen.getByText("Import as Saved Query")).toBeInTheDocument();
    });
  });

  it("'Open in Editor' calls onOpenInEditor with SQL", async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    const queryClient = createQueryClient();
    render(<ImportQueryModal {...props} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Open in Editor")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Open in Editor"));

    expect(props.onOpenInEditor).toHaveBeenCalledWith(
      "SELECT SubscriberKey FROM [_Subscribers]",
      "Weekly Subscribers",
    );
  });

  it("'Import as Saved Query' transitions to configure step", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Import as Saved Query")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Import as Saved Query"));

    expect(screen.getByText("Configure Import")).toBeInTheDocument();
    expect(screen.getByLabelText(/query name/i)).toBeInTheDocument();
  });

  it("configure step pre-fills name with QA name", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Import as Saved Query")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Import as Saved Query"));

    const nameInput = screen.getByLabelText(/query name/i);
    expect(nameInput).toHaveValue("Weekly Subscribers");
  });

  it("configure step imports and calls onImportSaved", async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    const queryClient = createQueryClient();

    server.use(
      http.post("/api/saved-queries", () => {
        return HttpResponse.json({
          id: "new-sq-1",
          name: "Weekly Subscribers",
          sqlText: "SELECT SubscriberKey FROM [_Subscribers]",
          folderId: null,
        });
      }),
    );

    render(<ImportQueryModal {...props} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Import as Saved Query")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Import as Saved Query"));
    await user.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(props.onImportSaved).toHaveBeenCalledWith(
        "new-sq-1",
        "Weekly Subscribers",
        "SELECT SubscriberKey FROM [_Subscribers]",
      );
    });
  });

  it("configure step back button returns to browse", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Import as Saved Query")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Import as Saved Query"));

    expect(screen.getByText("Configure Import")).toBeInTheDocument();

    await user.click(screen.getByText("Back to browse"));

    expect(
      screen.getByText("Import from Automation Studio"),
    ).toBeInTheDocument();
    expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument();
  });

  it("shows error when QA detail fetch fails", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/query-activities/:customerKey", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(
        screen.getByText("Failed to fetch Query Activity details. Try again."),
      ).toBeInTheDocument();
    });
  });

  it("prevents close while fetching detail", async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();

    server.use(
      http.get("/api/query-activities/:customerKey", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return HttpResponse.json({
          objectId: "qa-obj-1",
          customerKey: "qa-key-1",
          name: "Weekly Subscribers",
          queryText: "SELECT 1",
          targetUpdateType: "Overwrite",
          isLinked: false,
          linkedToQueryName: null,
        });
      }),
    );

    const queryClient = createQueryClient();
    render(<ImportQueryModal {...props} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Fetching...")).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    expect(cancelButton).toBeDisabled();
  });

  it("shows linked QA info without disabling selection", async () => {
    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Monthly Report")).toBeInTheDocument(),
    );

    expect(screen.getByText("Linked to: My Linked Query")).toBeInTheDocument();

    const monthlyButton = screen.getByText("Monthly Report").closest("button");
    expect(monthlyButton).not.toBeDisabled();
  });

  it("resets state when closed and reopened", async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    const queryClient = createQueryClient();

    const { rerender } = render(<ImportQueryModal {...props} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Import as Saved Query")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Import as Saved Query"));

    expect(screen.getByText("Configure Import")).toBeInTheDocument();

    // Close the modal
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    expect(props.onClose).toHaveBeenCalled();

    // Rerender with isOpen: false then true to simulate reopen
    rerender(<ImportQueryModal {...props} isOpen={false} />);
    rerender(<ImportQueryModal {...props} isOpen={true} />);

    await waitFor(() => {
      expect(
        screen.getByText("Import from Automation Studio"),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Configure Import")).not.toBeInTheDocument();
  });

  it("renders folder dropdown for Pro+ tier in configure step", async () => {
    mockTier = "pro";
    const user = userEvent.setup();
    const queryClient = createQueryClient();

    server.use(
      http.get("/api/folders", () => {
        return HttpResponse.json([
          { id: "f1", name: "My Folder", parentId: null, type: "library" },
        ]);
      }),
    );

    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Import as Saved Query")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Import as Saved Query"));

    await waitFor(() => {
      const folderSelect = screen.getByLabelText(/target folder/i);
      expect(folderSelect.tagName.toLowerCase()).toBe("select");
    });
  });

  it("renders locked folder message for free tier in configure step", async () => {
    mockTier = "free";
    const user = userEvent.setup();
    const queryClient = createQueryClient();

    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Import as Saved Query")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Import as Saved Query"));

    expect(screen.getByText("Folders available in Pro")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders QA items with missing optional metadata gracefully", async () => {
    const sparseQAList: QAListItem[] = [
      {
        objectId: "qa-obj-sparse",
        customerKey: "qa-key-sparse",
        name: "QA Sparse",
        targetUpdateType: undefined as unknown as string,
        targetDEName: undefined as unknown as string,
        modifiedDate: undefined as unknown as string,
        isLinked: false,
        linkedToQueryName: null,
      },
    ];

    server.use(
      http.get("/api/query-activities", () => {
        return HttpResponse.json(sparseQAList);
      }),
    );

    const queryClient = createQueryClient();
    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("QA Sparse")).toBeInTheDocument(),
    );

    const button = screen.getByText("QA Sparse").closest("button");
    expect(button).not.toBeDisabled();

    // Ensure no "undefined" text leaks into the UI
    const container = screen.getByText("QA Sparse").closest("button");
    expect(container).toBeTruthy();
    expect(container?.textContent).not.toContain("undefined");
  });

  it("passes selected folder to saved query creation", async () => {
    mockTier = "pro";
    const user = userEvent.setup();
    const props = createDefaultProps();
    const queryClient = createQueryClient();

    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.get("/api/folders", () => {
        return HttpResponse.json([
          { id: "f1", name: "My Folder", parentId: null, type: "library" },
          { id: "f2", name: "Other Folder", parentId: null, type: "library" },
        ]);
      }),
      http.post("/api/saved-queries", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "new-sq-1",
          name: "Weekly Subscribers",
          sqlText: "SELECT SubscriberKey FROM [_Subscribers]",
          folderId: "f2",
        });
      }),
    );

    render(<ImportQueryModal {...props} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Import as Saved Query")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Import as Saved Query"));

    await waitFor(() => {
      expect(screen.getByLabelText(/target folder/i)).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/target folder/i), "f2");
    await user.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(props.onImportSaved).toHaveBeenCalled();
    });

    expect(capturedBody).toEqual(expect.objectContaining({ folderId: "f2" }));
  });

  it("disables import button while save is pending", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();

    server.use(
      http.post("/api/saved-queries", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return HttpResponse.json({
          id: "new-sq-1",
          name: "Weekly Subscribers",
          sqlText: "SELECT 1",
          folderId: null,
        });
      }),
    );

    render(<ImportQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Weekly Subscribers")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Weekly Subscribers"));

    await waitFor(() => {
      expect(screen.getByText("Import as Saved Query")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Import as Saved Query"));

    const importButton = screen.getByRole("button", { name: /^import$/i });
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText("Importing...")).toBeInTheDocument();
      const pendingButton = screen.getByRole("button", {
        name: /importing/i,
      });
      expect(pendingButton).toBeDisabled();
    });
  });
});
