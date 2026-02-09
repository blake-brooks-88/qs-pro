import type { QADetail, QAListItem } from "@qpp/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { LinkQueryModal } from "../LinkQueryModal";

// DiffEditor mock (used inside LinkConflictDialog)
vi.mock("@monaco-editor/react", () => ({
  DiffEditor: ({
    original,
    modified,
  }: {
    original: string;
    modified: string;
  }) => (
    <div data-testid="mock-diff-editor">
      <span data-testid="diff-original">{original}</span>
      <span data-testid="diff-modified">{modified}</span>
    </div>
  ),
}));

const mockQAList: QAListItem[] = [
  {
    objectId: "qa-obj-1",
    customerKey: "qa-key-1",
    name: "QA Alpha",
    targetUpdateType: "Overwrite",
    modifiedDate: "2026-01-15T00:00:00Z",
    isLinked: false,
    linkedToQueryName: null,
  },
  {
    objectId: "qa-obj-2",
    customerKey: "qa-key-2",
    name: "QA Beta",
    targetUpdateType: "Append",
    modifiedDate: "2026-01-16T00:00:00Z",
    isLinked: true,
    linkedToQueryName: "Other Query",
  },
  {
    objectId: "qa-obj-3",
    customerKey: "qa-key-3",
    name: "QA Gamma",
    targetUpdateType: "Overwrite",
    modifiedDate: "2026-01-17T00:00:00Z",
    isLinked: false,
    linkedToQueryName: null,
  },
];

const matchingDetail: QADetail = {
  objectId: "qa-obj-1",
  customerKey: "qa-key-1",
  name: "QA Alpha",
  queryText: "SELECT 1 FROM [DE]",
  targetUpdateType: "Overwrite",
  isLinked: false,
  linkedToQueryName: null,
};

const conflictingDetail: QADetail = {
  objectId: "qa-obj-3",
  customerKey: "qa-key-3",
  name: "QA Gamma",
  queryText: "SELECT DIFFERENT FROM [DE]",
  targetUpdateType: "Overwrite",
  isLinked: false,
  linkedToQueryName: null,
};

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
    savedQueryId: "sq-1",
    savedQueryName: "My Query",
    currentSql: "SELECT 1 FROM [DE]",
    onLinkComplete: vi.fn(),
    onCreateNew: vi.fn(),
  };
}

describe("LinkQueryModal", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/query-activities", () => {
        return HttpResponse.json(mockQAList);
      }),
    );
  });

  it("renders dialog title", () => {
    const queryClient = createQueryClient();
    render(<LinkQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    expect(screen.getByText("Link to Query Activity")).toBeInTheDocument();
  });

  it("shows saved query name in subtitle", () => {
    const queryClient = createQueryClient();
    render(<LinkQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    expect(screen.getByText(/My Query/)).toBeInTheDocument();
  });

  it("renders QA list after loading", async () => {
    const queryClient = createQueryClient();
    render(<LinkQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(screen.getByText("QA Alpha")).toBeInTheDocument();
      expect(screen.getByText("QA Beta")).toBeInTheDocument();
      expect(screen.getByText("QA Gamma")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    server.use(
      http.get("/api/query-activities", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json(mockQAList);
      }),
    );

    const queryClient = createQueryClient();
    render(<LinkQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    expect(screen.getByText("Loading Query Activities...")).toBeInTheDocument();
  });

  it("filters QA list by search term", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    render(<LinkQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("QA Alpha")).toBeInTheDocument(),
    );

    const searchInput = screen.getByPlaceholderText(/search query activities/i);
    await user.type(searchInput, "Beta");

    expect(screen.getByText("QA Beta")).toBeInTheDocument();
    expect(screen.queryByText("QA Alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("QA Gamma")).not.toBeInTheDocument();
  });

  it("disables linked QA items", async () => {
    const queryClient = createQueryClient();
    render(<LinkQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("QA Beta")).toBeInTheDocument(),
    );

    // Find the button containing "QA Beta" — it should be disabled
    const betaButton = screen.getByText("QA Beta").closest("button");
    expect(betaButton).toBeDisabled();
  });

  it("shows 'Linked to' text for already-linked QAs", async () => {
    const queryClient = createQueryClient();
    render(<LinkQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("Linked to: Other Query")).toBeInTheDocument(),
    );
  });

  it("triggers silent link when SQL matches (no conflict)", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/query-activities/:customerKey", () => {
        return HttpResponse.json(matchingDetail);
      }),
      http.post("/api/query-activities/link/:savedQueryId", () => {
        return HttpResponse.json({
          linkedQaObjectId: "qa-obj-1",
          linkedQaCustomerKey: "qa-key-1",
          linkedQaName: "QA Alpha",
          linkedAt: new Date().toISOString(),
          sqlUpdated: false,
        });
      }),
    );

    const props = createDefaultProps();
    const queryClient = createQueryClient();
    render(<LinkQueryModal {...props} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("QA Alpha")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("QA Alpha"));

    await waitFor(() => {
      expect(props.onLinkComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          linkedQaCustomerKey: "qa-key-1",
          sqlUpdated: false,
        }),
      );
    });
  });

  it("opens conflict dialog when SQL differs", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/query-activities/:customerKey", () => {
        return HttpResponse.json(conflictingDetail);
      }),
    );

    const queryClient = createQueryClient();
    render(<LinkQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("QA Gamma")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("QA Gamma"));

    await waitFor(() => {
      expect(screen.getByText("SQL Conflict Detected")).toBeInTheDocument();
    });
  });

  it("calls onCreateNew when 'Create New' button clicked", async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    const queryClient = createQueryClient();

    render(<LinkQueryModal {...props} />, {
      wrapper: createWrapper(queryClient),
    });

    await user.click(screen.getByText("Create New"));

    expect(props.onCreateNew).toHaveBeenCalled();
  });

  it("calls onClose when Cancel clicked", async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    const queryClient = createQueryClient();

    render(<LinkQueryModal {...props} />, {
      wrapper: createWrapper(queryClient),
    });

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onClose).toHaveBeenCalled();
  });

  it("shows error message when detail fetch fails", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/query-activities/:customerKey", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const queryClient = createQueryClient();
    render(<LinkQueryModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(screen.getByText("QA Alpha")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("QA Alpha"));

    await waitFor(() => {
      expect(
        screen.getByText(/failed to fetch query activity details/i),
      ).toBeInTheDocument();
    });
  });

  it("does not render when isOpen is false", () => {
    const queryClient = createQueryClient();
    render(<LinkQueryModal {...createDefaultProps()} isOpen={false} />, {
      wrapper: createWrapper(queryClient),
    });

    expect(
      screen.queryByText("Link to Query Activity"),
    ).not.toBeInTheDocument();
  });
});
