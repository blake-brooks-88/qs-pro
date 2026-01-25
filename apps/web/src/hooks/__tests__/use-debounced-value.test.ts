import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "@/hooks/use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("initial"));

    expect(result.current).toBe("initial");
  });

  it("does not update value before delay expires", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value),
      { initialProps: { value: "initial" } },
    );

    rerender({ value: "updated" });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe("initial");
  });

  it("updates value after default delay (150ms)", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value),
      { initialProps: { value: "initial" } },
    );

    rerender({ value: "updated" });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current).toBe("updated");
  });

  it("uses custom delay when provided", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: "initial", delay: 300 } },
    );

    rerender({ value: "updated", delay: 300 });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe("initial");

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe("updated");
  });

  it("resets debounce timer when value changes again", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "initial" } },
    );

    rerender({ value: "first" });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: "second" });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe("initial");

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe("second");
  });

  it("handles rapid value changes", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: 1 } },
    );

    for (let i = 2; i <= 10; i++) {
      rerender({ value: i });
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }

    expect(result.current).toBe(1);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe(10);
  });

  it("works with object values", () => {
    const initialObj = { name: "initial" };
    const updatedObj = { name: "updated" };

    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value),
      { initialProps: { value: initialObj } },
    );

    rerender({ value: updatedObj });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current).toEqual(updatedObj);
  });

  it("handles null and undefined values", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue<string | null | undefined>(value),
      { initialProps: { value: "initial" as string | null | undefined } },
    );

    rerender({ value: null });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current).toBeNull();

    rerender({ value: undefined });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current).toBeUndefined();
  });

  it("cleans up timeout on unmount", () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { unmount, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value),
      { initialProps: { value: "initial" } },
    );

    rerender({ value: "updated" });
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
