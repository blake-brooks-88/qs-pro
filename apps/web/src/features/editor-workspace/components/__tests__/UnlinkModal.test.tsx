import type { BlastRadiusResponse } from "@qpp/shared-types";
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
    savedQueryId: "sq-1",
    savedQueryName: "My Test Query",
    linkedQaName: "Weekly Report QA",
    linkedQaCustomerKey: "qa-key-1",
    onUnlinkComplete: vi.fn(),
  };
}

const TIER_2_BLAST_RADIUS: BlastRadiusResponse = {
  automations: [
    {
      id: "auto-1",
      name: "Nightly Sync",
      status: "Stopped",
      isHighRisk: false,
    },
    {
      id: "auto-2",
      name: "Old Import",
      status: "Stopped",
      isHighRisk: false,
    },
  ],
  totalCount: 2,
};

const TIER_3_BLAST_RADIUS: BlastRadiusResponse = {
  automations: [
    {
      id: "auto-1",
      name: "Daily Send",
      status: "Scheduled",
      isHighRisk: true,
    },
    {
      id: "auto-2",
      name: "Weekly Report",
      status: "Stopped",
      isHighRisk: false,
    },
    {
      id: "auto-3",
      name: "Live Campaign",
      status: "Running",
      isHighRisk: true,
    },
  ],
  totalCount: 3,
};

async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  const option = screen.getByRole("radio", { name: new RegExp(label) });
  await user.click(option);
}

describe("UnlinkModal", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
  });

  // =========================================================================
  // Rendering
  // =========================================================================

  describe("rendering", () => {
    it("renders dialog title and description when open", () => {
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      expect(screen.getByText("Unlink Query Activity")).toBeInTheDocument();
      expect(
        screen.getByText(
          /Disconnect.*My Test Query.*from.*Weekly Report QA.*in Automation Studio/,
        ),
      ).toBeInTheDocument();
    });

    it("does not render when closed", () => {
      render(<UnlinkModal {...createDefaultProps()} open={false} />, {
        wrapper: createWrapper(queryClient),
      });

      expect(
        screen.queryByText("Unlink Query Activity"),
      ).not.toBeInTheDocument();
    });

    it("shows loading state while blast radius is fetching", async () => {
      const user = userEvent.setup();
      server.use(
        http.get(
          "/api/query-activities/blast-radius/:savedQueryId",
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return HttpResponse.json({
              automations: [],
              totalCount: 0,
            });
          },
        ),
      );

      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      expect(screen.getByText("Loading automations...")).toBeInTheDocument();
    });

    it("shows all 4 radio options", () => {
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      expect(screen.getByText("Unlink only (keep both)")).toBeInTheDocument();
      expect(screen.getByText("Unlink + delete Q++ query")).toBeInTheDocument();
      expect(
        screen.getByText("Unlink + delete AS Query Activity"),
      ).toBeInTheDocument();
      expect(screen.getByText("Unlink + delete both")).toBeInTheDocument();
    });

    it("default selection is unlink-only", () => {
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      const unlinkOnlyOption = screen.getByRole("radio", {
        name: /Unlink only \(keep both\)/,
      });
      expect(unlinkOnlyOption).toHaveAttribute("aria-checked", "true");
    });
  });

  // =========================================================================
  // Option selection
  // =========================================================================

  describe("option selection", () => {
    it("selecting delete-AS-only shows blast radius section", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(screen.getByText("Blast Radius")).toBeInTheDocument();
      });
    });

    it("selecting delete-both shows blast radius section", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete both");

      await waitFor(() => {
        expect(screen.getByText("Blast Radius")).toBeInTheDocument();
      });
    });

    it("selecting unlink-only hides blast radius section", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      // First select delete-remote to show it
      await selectOption(user, "Unlink \\+ delete AS Query Activity");
      await waitFor(() => {
        expect(screen.getByText("Blast Radius")).toBeInTheDocument();
      });

      // Then switch back to unlink-only
      await selectOption(user, "Unlink only \\(keep both\\)");

      expect(screen.queryByText("Blast Radius")).not.toBeInTheDocument();
    });

    it("selecting delete-Q++-only hides blast radius section", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      // First select delete-remote to show it
      await selectOption(user, "Unlink \\+ delete AS Query Activity");
      await waitFor(() => {
        expect(screen.getByText("Blast Radius")).toBeInTheDocument();
      });

      // Then switch to delete-local
      await selectOption(user, "Unlink \\+ delete Q\\+\\+ query");

      expect(screen.queryByText("Blast Radius")).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Tier 1 - No automations
  // =========================================================================

  describe("Tier 1 - no automations", () => {
    it("shows 'not used by any automations' message", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(
          screen.getByText(
            "This Query Activity is not used by any automations.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("confirm button enabled immediately", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(
          screen.getByText(
            "This Query Activity is not used by any automations.",
          ),
        ).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /Unlink & Delete/,
      });
      expect(confirmButton).not.toBeDisabled();
    });
  });

  // =========================================================================
  // Tier 2 - Inactive automations only
  // =========================================================================

  describe("Tier 2 - inactive automations only", () => {
    beforeEach(() => {
      server.use(
        http.get("/api/query-activities/blast-radius/:savedQueryId", () => {
          return HttpResponse.json(TIER_2_BLAST_RADIUS);
        }),
      );
    });

    it("shows automation list with names and statuses", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(screen.getByText("Nightly Sync")).toBeInTheDocument();
      });
      expect(screen.getByText("Old Import")).toBeInTheDocument();
      expect(screen.getAllByText("Stopped")).toHaveLength(2);
    });

    it("shows type-to-confirm input", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(screen.getByText("Nightly Sync")).toBeInTheDocument();
      });

      const confirmInput = screen.getByLabelText(
        /Type the Query Activity name/,
      );
      expect(confirmInput).toBeInTheDocument();
      expect(confirmInput).toHaveAttribute("placeholder", "Weekly Report QA");
    });

    it("confirm disabled until exact QA name typed", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(screen.getByText("Nightly Sync")).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /Unlink & Delete/,
      });
      expect(confirmButton).toBeDisabled();

      const confirmInput = screen.getByLabelText(
        /Type the Query Activity name/,
      );
      await user.type(confirmInput, "Weekly Report QA");

      expect(confirmButton).not.toBeDisabled();
    });

    it("typing wrong name keeps confirm disabled", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(screen.getByText("Nightly Sync")).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /Unlink & Delete/,
      });
      const confirmInput = screen.getByLabelText(
        /Type the Query Activity name/,
      );

      await user.type(confirmInput, "weekly report qa");

      expect(confirmButton).toBeDisabled();
    });
  });

  // =========================================================================
  // Tier 3 - Active/scheduled automations
  // =========================================================================

  describe("Tier 3 - active/scheduled automations", () => {
    beforeEach(() => {
      server.use(
        http.get("/api/query-activities/blast-radius/:savedQueryId", () => {
          return HttpResponse.json(TIER_3_BLAST_RADIUS);
        }),
      );
    });

    it("shows automation list with high-risk items highlighted", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(screen.getByText("Daily Send")).toBeInTheDocument();
      });
      expect(screen.getByText("Weekly Report")).toBeInTheDocument();
      expect(screen.getByText("Live Campaign")).toBeInTheDocument();

      const listItems = screen.getAllByRole("listitem");
      expect(listItems).toHaveLength(3);

      const highRiskDots = document.querySelectorAll(".bg-amber-500");
      expect(highRiskDots).toHaveLength(2);
    });

    it("shows acknowledgment checkbox", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(screen.getByText("Daily Send")).toBeInTheDocument();
      });

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeInTheDocument();
      expect(
        screen.getByText(/I understand this will affect 2 active automations/),
      ).toBeInTheDocument();
    });

    it("confirm disabled until BOTH name typed AND checkbox checked", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(screen.getByText("Daily Send")).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /Unlink & Delete/,
      });
      const confirmInput = screen.getByLabelText(
        /Type the Query Activity name/,
      );
      const checkbox = screen.getByRole("checkbox");

      // Initially disabled
      expect(confirmButton).toBeDisabled();

      // Type correct name AND check checkbox
      await user.type(confirmInput, "Weekly Report QA");
      await user.click(checkbox);

      expect(confirmButton).not.toBeDisabled();
    });

    it("name typed but checkbox unchecked keeps confirm disabled", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(screen.getByText("Daily Send")).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /Unlink & Delete/,
      });
      const confirmInput = screen.getByLabelText(
        /Type the Query Activity name/,
      );

      await user.type(confirmInput, "Weekly Report QA");

      expect(confirmButton).toBeDisabled();
    });

    it("checkbox checked but name wrong keeps confirm disabled", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(screen.getByText("Daily Send")).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /Unlink & Delete/,
      });
      const confirmInput = screen.getByLabelText(
        /Type the Query Activity name/,
      );
      const checkbox = screen.getByRole("checkbox");

      await user.type(confirmInput, "wrong name");
      await user.click(checkbox);

      expect(confirmButton).toBeDisabled();
    });
  });

  // =========================================================================
  // Blast radius error state
  // =========================================================================

  describe("blast radius error - falls back to type-to-confirm", () => {
    beforeEach(() => {
      server.use(
        http.get("/api/query-activities/blast-radius/:savedQueryId", () => {
          return HttpResponse.json(
            { message: "Internal Server Error" },
            { status: 500 },
          );
        }),
      );
    });

    it("shows warning message when blast radius fails", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(
          screen.getByText(
            /Unable to check automations\. Type the Query Activity name to confirm\./,
          ),
        ).toBeInTheDocument();
      });
    });

    it("shows type-to-confirm input on error", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(
          screen.getByText(/Unable to check automations/),
        ).toBeInTheDocument();
      });

      const confirmInput = screen.getByLabelText(
        /Type the Query Activity name/,
      );
      expect(confirmInput).toBeInTheDocument();
      expect(confirmInput).toHaveAttribute("placeholder", "Weekly Report QA");
    });

    it("confirm disabled until exact QA name typed", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(
          screen.getByText(/Unable to check automations/),
        ).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /Unlink & Delete/,
      });
      expect(confirmButton).toBeDisabled();

      const confirmInput = screen.getByLabelText(
        /Type the Query Activity name/,
      );
      await user.type(confirmInput, "Weekly Report QA");

      expect(confirmButton).not.toBeDisabled();
    });

    it("typing wrong name keeps confirm disabled", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(
          screen.getByText(/Unable to check automations/),
        ).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /Unlink & Delete/,
      });
      const confirmInput = screen.getByLabelText(
        /Type the Query Activity name/,
      );

      await user.type(confirmInput, "wrong name");

      expect(confirmButton).toBeDisabled();
    });
  });

  // =========================================================================
  // Interactions
  // =========================================================================

  describe("interactions", () => {
    it("confirm calls mutation with unlink-only options", async () => {
      const unlinkSpy = vi.fn();
      server.use(
        http.delete(
          "/api/query-activities/link/:savedQueryId",
          async ({ request }) => {
            const body = await request.json();
            unlinkSpy(body);
            return HttpResponse.json({ success: true });
          },
        ),
      );

      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<UnlinkModal {...props} />, {
        wrapper: createWrapper(queryClient),
      });

      // Default is unlink-only, confirm should be enabled
      const confirmButton = screen.getByRole("button", { name: "Unlink" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(unlinkSpy).toHaveBeenCalledWith({
          deleteLocal: false,
          deleteRemote: false,
        });
      });
    });

    it("confirm calls mutation with deleteRemote option", async () => {
      const unlinkSpy = vi.fn();
      server.use(
        http.delete(
          "/api/query-activities/link/:savedQueryId",
          async ({ request }) => {
            const body = await request.json();
            unlinkSpy(body);
            return HttpResponse.json({ success: true });
          },
        ),
      );

      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<UnlinkModal {...props} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      // Wait for blast radius (Tier 1 - no automations), confirm enabled
      await waitFor(() => {
        expect(
          screen.getByText(
            "This Query Activity is not used by any automations.",
          ),
        ).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /Unlink & Delete/,
      });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(unlinkSpy).toHaveBeenCalledWith({
          deleteLocal: false,
          deleteRemote: true,
        });
      });
    });

    it("confirm calls mutation with deleteLocal option", async () => {
      const unlinkSpy = vi.fn();
      server.use(
        http.delete(
          "/api/query-activities/link/:savedQueryId",
          async ({ request }) => {
            const body = await request.json();
            unlinkSpy(body);
            return HttpResponse.json({ success: true });
          },
        ),
      );

      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<UnlinkModal {...props} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete Q\\+\\+ query");

      const confirmButton = screen.getByRole("button", {
        name: /Unlink & Delete/,
      });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(unlinkSpy).toHaveBeenCalledWith({
          deleteLocal: true,
          deleteRemote: false,
        });
      });
    });

    it("confirm calls mutation with both delete options", async () => {
      const unlinkSpy = vi.fn();
      server.use(
        http.delete(
          "/api/query-activities/link/:savedQueryId",
          async ({ request }) => {
            const body = await request.json();
            unlinkSpy(body);
            return HttpResponse.json({ success: true });
          },
        ),
      );

      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<UnlinkModal {...props} />, {
        wrapper: createWrapper(queryClient),
      });

      await selectOption(user, "Unlink \\+ delete both");

      // Wait for blast radius (Tier 1 - no automations), confirm enabled
      await waitFor(() => {
        expect(
          screen.getByText(
            "This Query Activity is not used by any automations.",
          ),
        ).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /Unlink & Delete/,
      });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(unlinkSpy).toHaveBeenCalledWith({
          deleteLocal: true,
          deleteRemote: true,
        });
      });
    });

    it("cancel closes dialog", async () => {
      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<UnlinkModal {...props} />, {
        wrapper: createWrapper(queryClient),
      });

      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(props.onClose).toHaveBeenCalled();
    });

    it("pending state disables all interactions", async () => {
      server.use(
        http.delete("/api/query-activities/link/:savedQueryId", async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return HttpResponse.json({ success: true });
        }),
      );

      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<UnlinkModal {...props} />, {
        wrapper: createWrapper(queryClient),
      });

      // Click confirm to trigger mutation
      const confirmButton = screen.getByRole("button", { name: "Unlink" });
      await user.click(confirmButton);

      // Now the mutation is pending
      await waitFor(() => {
        expect(screen.getByText("Unlinking...")).toBeInTheDocument();
      });

      const pendingButton = screen.getByRole("button", {
        name: /Unlinking/,
      });
      expect(pendingButton).toBeDisabled();

      expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();

      // Radio options should be disabled (opacity-50 + pointer-events-none)
      const radios = screen.getAllByRole("radio");
      for (const radio of radios) {
        expect(radio).toBeDisabled();
      }
    });

    it("calls onUnlinkComplete after successful mutation", async () => {
      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<UnlinkModal {...props} />, {
        wrapper: createWrapper(queryClient),
      });

      const confirmButton = screen.getByRole("button", { name: "Unlink" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(props.onUnlinkComplete).toHaveBeenCalledWith({
          deleteLocal: false,
          deleteRemote: false,
        });
      });
    });

    it("calls onClose after successful mutation", async () => {
      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<UnlinkModal {...props} />, {
        wrapper: createWrapper(queryClient),
      });

      const confirmButton = screen.getByRole("button", { name: "Unlink" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(props.onClose).toHaveBeenCalled();
      });
    });

    it("shows destructive button variant for delete options", async () => {
      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      // Default: non-destructive "Unlink" button
      expect(
        screen.getByRole("button", { name: "Unlink" }),
      ).toBeInTheDocument();

      await selectOption(user, "Unlink \\+ delete Q\\+\\+ query");

      expect(
        screen.getByRole("button", { name: /Unlink & Delete/ }),
      ).toBeInTheDocument();
    });

    it("resets state when switching options", async () => {
      server.use(
        http.get("/api/query-activities/blast-radius/:savedQueryId", () => {
          return HttpResponse.json(TIER_2_BLAST_RADIUS);
        }),
      );

      const user = userEvent.setup();
      render(<UnlinkModal {...createDefaultProps()} />, {
        wrapper: createWrapper(queryClient),
      });

      // Select delete-remote to trigger blast radius
      await selectOption(user, "Unlink \\+ delete AS Query Activity");

      await waitFor(() => {
        expect(screen.getByText("Nightly Sync")).toBeInTheDocument();
      });

      // Type the QA name
      const confirmInput = screen.getByLabelText(
        /Type the Query Activity name/,
      );
      await user.type(confirmInput, "Weekly Report QA");

      // Switch to delete-both (also shows blast radius, so confirm input reappears)
      await selectOption(user, "Unlink \\+ delete both");

      await waitFor(() => {
        expect(screen.getByText("Nightly Sync")).toBeInTheDocument();
      });

      // Input should be reset
      const resetInput = screen.getByLabelText(/Type the Query Activity name/);
      expect(resetInput).toHaveValue("");
    });
  });
});
