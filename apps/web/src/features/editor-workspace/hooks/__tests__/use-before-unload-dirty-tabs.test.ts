import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBeforeUnloadDirtyTabs } from "../use-before-unload-dirty-tabs";

describe("useBeforeUnloadDirtyTabs", () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, "addEventListener");
    removeSpy = vi.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("prevents unload when dirty tabs exist", () => {
    renderHook(() =>
      useBeforeUnloadDirtyTabs([{ isDirty: true }, { isDirty: false }]),
    );

    const handler = addSpy.mock.calls.find(
      ([event]) => event === "beforeunload",
    )?.[1] as (e: BeforeUnloadEvent) => void;

    expect(handler).toBeDefined();

    const event = new Event("beforeunload") as BeforeUnloadEvent;
    const preventSpy = vi.spyOn(event, "preventDefault");

    handler(event);

    expect(preventSpy).toHaveBeenCalled();
  });

  it("does NOT prevent when all tabs clean", () => {
    renderHook(() =>
      useBeforeUnloadDirtyTabs([{ isDirty: false }, { isDirty: false }]),
    );

    const handler = addSpy.mock.calls.find(
      ([event]) => event === "beforeunload",
    )?.[1] as (e: BeforeUnloadEvent) => void;

    const event = new Event("beforeunload") as BeforeUnloadEvent;
    const preventSpy = vi.spyOn(event, "preventDefault");

    handler(event);

    expect(preventSpy).not.toHaveBeenCalled();
  });

  it("removes listener on unmount", () => {
    const { unmount } = renderHook(() =>
      useBeforeUnloadDirtyTabs([{ isDirty: true }]),
    );

    unmount();

    expect(removeSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("updates listener when tabs change", () => {
    const { rerender } = renderHook(
      ({ tabs }: { tabs: ReadonlyArray<{ isDirty: boolean }> }) =>
        useBeforeUnloadDirtyTabs(tabs),
      { initialProps: { tabs: [{ isDirty: false }] } },
    );

    const initialAddCount = addSpy.mock.calls.filter(
      ([event]) => event === "beforeunload",
    ).length;

    rerender({ tabs: [{ isDirty: true }] });

    const removeCount = removeSpy.mock.calls.filter(
      ([event]) => event === "beforeunload",
    ).length;
    expect(removeCount).toBeGreaterThanOrEqual(1);

    const afterAddCount = addSpy.mock.calls.filter(
      ([event]) => event === "beforeunload",
    ).length;
    expect(afterAddCount).toBeGreaterThan(initialAddCount);
  });
});
