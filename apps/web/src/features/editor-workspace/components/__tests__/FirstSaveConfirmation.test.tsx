import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRelationshipStore } from "@/features/editor-workspace/store/relationship-store";

import { FirstSaveConfirmation } from "../FirstSaveConfirmation";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return TestWrapper;
}

const pendingSave = {
  sourceDE: "Subscribers",
  sourceColumn: "SubscriberKey",
  targetDE: "Orders",
  targetColumn: "SubscriberKey",
};

describe("FirstSaveConfirmation", () => {
  beforeEach(() => {
    useRelationshipStore.setState({
      showFirstSaveDialog: false,
      pendingSave: null,
      configDEConfirmed: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render dialog content when showFirstSaveDialog is false", () => {
    const onConfirmSave = vi.fn();
    render(<FirstSaveConfirmation onConfirmSave={onConfirmSave} />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByText("Save Relationship")).not.toBeInTheDocument();
  });

  it("renders dialog with disclosure text when showFirstSaveDialog is true", () => {
    useRelationshipStore.setState({
      showFirstSaveDialog: true,
      pendingSave,
    });

    const onConfirmSave = vi.fn();
    render(<FirstSaveConfirmation onConfirmSave={onConfirmSave} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Save Relationship")).toBeInTheDocument();
    expect(screen.getByText(/config Data Extension/)).toBeInTheDocument();
    expect(screen.getByText(/No data leaves your account/)).toBeInTheDocument();
  });

  it("Create & Save calls onConfirmSave with pending save data", async () => {
    useRelationshipStore.setState({
      showFirstSaveDialog: true,
      pendingSave,
    });

    const user = userEvent.setup();
    const onConfirmSave = vi.fn();
    render(<FirstSaveConfirmation onConfirmSave={onConfirmSave} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByText("Create & Save"));

    expect(onConfirmSave).toHaveBeenCalledWith(pendingSave);
  });

  it("Cancel closes dialog without calling onConfirmSave", async () => {
    useRelationshipStore.setState({
      showFirstSaveDialog: true,
      pendingSave,
    });

    const user = userEvent.setup();
    const onConfirmSave = vi.fn();
    render(<FirstSaveConfirmation onConfirmSave={onConfirmSave} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByText("Cancel"));

    expect(onConfirmSave).not.toHaveBeenCalled();
    expect(useRelationshipStore.getState().showFirstSaveDialog).toBe(false);
  });

  it("dialog is not dismissible via Escape key", () => {
    useRelationshipStore.setState({
      showFirstSaveDialog: true,
      pendingSave,
    });

    const onConfirmSave = vi.fn();
    render(<FirstSaveConfirmation onConfirmSave={onConfirmSave} />, {
      wrapper: createWrapper(),
    });

    fireEvent.keyDown(screen.getByText("Save Relationship"), {
      key: "Escape",
    });

    expect(screen.getByText("Save Relationship")).toBeInTheDocument();
  });
});
