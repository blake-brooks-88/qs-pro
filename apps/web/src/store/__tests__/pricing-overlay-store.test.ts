import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { usePricingOverlayStore } from "@/store/pricing-overlay-store";

describe("usePricingOverlayStore", () => {
  beforeEach(() => {
    const { result } = renderHook(() => usePricingOverlayStore());
    act(() => result.current.close());
  });

  it("has initial state of closed with null source", () => {
    const { result } = renderHook(() => usePricingOverlayStore());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.source).toBeNull();
  });

  it("open() sets isOpen to true and stores source", () => {
    const { result } = renderHook(() => usePricingOverlayStore());

    act(() => result.current.open("header"));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.source).toBe("header");
  });

  it("open() without source argument sets source to null", () => {
    const { result } = renderHook(() => usePricingOverlayStore());

    act(() => result.current.open());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.source).toBeNull();
  });

  it("close() resets isOpen to false and source to null", () => {
    const { result } = renderHook(() => usePricingOverlayStore());

    act(() => result.current.open("feature_gate"));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.source).toBe("feature_gate");

    act(() => result.current.close());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.source).toBeNull();
  });
});
