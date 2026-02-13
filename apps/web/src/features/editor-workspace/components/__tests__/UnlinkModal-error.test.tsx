import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { UnlinkModal } from "../UnlinkModal";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

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
    open: true,
    onClose: vi.fn(),
    savedQueryId: "sq-err-1",
    savedQueryName: "Error Test Query",
    linkedQaName: "Error Test QA",
    linkedQaCustomerKey: "qa-key-err-1",
    onUnlinkComplete: vi.fn(),
  };
}

async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  // eslint-disable-next-line security/detect-non-literal-regexp
  const option = screen.getByRole("radio", { name: new RegExp(label) });
  await user.click(option);
}

async function waitForErrorWarning() {
  await waitFor(() => {
    expect(
      screen.getByText(/Unable to verify automation usage/),
    ).toBeInTheDocument();
  });
}

describe("UnlinkModal - blast radius error state", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    server.use(
      http.get("/api/query-activities/blast-radius/:savedQueryId", () => {
        return HttpResponse.json(
          { message: "Internal Server Error" },
          { status: 500 },
        );
      }),
    );
  });

  it("does NOT show 'not used by any automations' message when blast radius errors", async () => {
    const user = userEvent.setup();
    render(<UnlinkModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await selectOption(user, "Unlink \\+ delete AS Query Activity");
    await waitForErrorWarning();

    expect(
      screen.queryByText("This Query Activity is not used by any automations."),
    ).not.toBeInTheDocument();
  });

  it("shows error warning for delete-both option", async () => {
    const user = userEvent.setup();
    render(<UnlinkModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await selectOption(user, "Unlink \\+ delete both");
    await waitForErrorWarning();

    expect(
      screen.getByText(/Name confirmation required as a safety precaution/),
    ).toBeInTheDocument();
  });

  it("does NOT show acknowledgment checkbox on error (tier 2 only, not tier 3)", async () => {
    const user = userEvent.setup();
    render(<UnlinkModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await selectOption(user, "Unlink \\+ delete AS Query Activity");
    await waitForErrorWarning();

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("confirm button is disabled before typing QA name (no tier 1 bypass)", async () => {
    const user = userEvent.setup();
    render(<UnlinkModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await selectOption(user, "Unlink \\+ delete AS Query Activity");
    await waitForErrorWarning();

    const confirmButton = screen.getByRole("button", {
      name: /Unlink & Delete/,
    });
    expect(confirmButton).toBeDisabled();
  });

  it("confirm button enables after typing exact QA name", async () => {
    const user = userEvent.setup();
    render(<UnlinkModal {...createDefaultProps()} />, {
      wrapper: createWrapper(queryClient),
    });

    await selectOption(user, "Unlink \\+ delete AS Query Activity");
    await waitForErrorWarning();

    const confirmInput = screen.getByLabelText(/Type the Query Activity name/);
    await user.type(confirmInput, "Error Test QA");

    const confirmButton = screen.getByRole("button", {
      name: /Unlink & Delete/,
    });
    expect(confirmButton).not.toBeDisabled();
  });
});
