import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FeatureOverridesCard } from "./FeatureOverridesCard";

const mocks = vi.hoisted(() => ({
  setMutate: vi.fn(),
  removeMutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  overrides: [{ featureKey: "advancedAutocomplete", enabled: true }] as Array<{
    featureKey: string;
    enabled: boolean;
  }>,
}));

vi.mock("@qpp/shared-types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qpp/shared-types")>();
  return { ...actual, ALL_FEATURE_KEYS: ["advancedAutocomplete"] };
});

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock("../hooks/use-tenant-detail", () => ({
  useFeatureOverrides: () => ({
    data: mocks.overrides,
  }),
  useSetFeatureOverride: () => ({ mutate: mocks.setMutate }),
  useRemoveFeatureOverride: () => ({ mutate: mocks.removeMutate }),
}));

describe("FeatureOverridesCard", () => {
  it("removes an override and shows a success toast", async () => {
    mocks.overrides = [{ featureKey: "advancedAutocomplete", enabled: true }];
    mocks.removeMutate.mockImplementation(
      (
        _vars: unknown,
        opts: { onSuccess?: () => void; onError?: () => void },
      ) => {
        opts.onSuccess?.();
      },
    );

    render(<FeatureOverridesCard tenantId="tenant-1" />);
    const switches = screen.getAllByRole("switch");
    await userEvent.click(switches[0] as HTMLElement);

    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Override removed: advancedAutocomplete",
    );
  });

  it("sets an override when not currently overridden", async () => {
    mocks.overrides = [];
    mocks.setMutate.mockImplementation(
      (
        _vars: unknown,
        opts: { onSuccess?: () => void; onError?: () => void },
      ) => {
        opts.onSuccess?.();
      },
    );

    render(<FeatureOverridesCard tenantId="tenant-1" />);
    const switches = screen.getAllByRole("switch");
    await userEvent.click(switches[0] as HTMLElement);

    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Override enabled: advancedAutocomplete",
    );
  });
});
