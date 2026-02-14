import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useResultsPaneResize } from "../use-results-pane-resize";

function createMockRef(clientHeight = 800) {
  return {
    current: {
      clientHeight,
    } as HTMLElement,
  };
}

function createPointerEvent(
  clientY: number,
): ReactPointerEvent<HTMLDivElement> {
  return {
    clientY,
    preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLDivElement>;
}

describe("useResultsPaneResize", () => {
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

  it("initial state: isResultsOpen=false", () => {
    const ref = createMockRef();
    const { result } = renderHook(() =>
      useResultsPaneResize({ workspaceRef: ref }),
    );

    expect(result.current.isResultsOpen).toBe(false);
    expect(result.current.resultsHeight).toBe(280);
    expect(result.current.isResizingResults).toBe(false);
  });

  it("openResultsPane() sets open", () => {
    const ref = createMockRef();
    const { result } = renderHook(() =>
      useResultsPaneResize({ workspaceRef: ref }),
    );

    act(() => {
      result.current.openResultsPane();
    });

    expect(result.current.isResultsOpen).toBe(true);
  });

  it("toggleResultsPane() toggles", () => {
    const ref = createMockRef();
    const { result } = renderHook(() =>
      useResultsPaneResize({ workspaceRef: ref }),
    );

    act(() => {
      result.current.toggleResultsPane();
    });
    expect(result.current.isResultsOpen).toBe(true);

    act(() => {
      result.current.toggleResultsPane();
    });
    expect(result.current.isResultsOpen).toBe(false);
  });

  it("handleResultsResizeStart no-op when ref.current null", () => {
    const ref = { current: null };
    const { result } = renderHook(() =>
      useResultsPaneResize({ workspaceRef: ref }),
    );

    const event = createPointerEvent(400);

    act(() => {
      result.current.handleResultsResizeStart(event);
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(result.current.isResizingResults).toBe(false);
  });

  it("drag: registers pointermove/pointerup on window", () => {
    const ref = createMockRef();
    const { result } = renderHook(() =>
      useResultsPaneResize({ workspaceRef: ref }),
    );

    act(() => {
      result.current.handleResultsResizeStart(createPointerEvent(400));
    });

    expect(addSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("pointerup", expect.any(Function));
    expect(result.current.isResizingResults).toBe(true);
  });

  it("drag: clamps height to min 160", () => {
    const ref = createMockRef(800);
    const { result } = renderHook(() =>
      useResultsPaneResize({ workspaceRef: ref, initialHeight: 200 }),
    );

    act(() => {
      result.current.handleResultsResizeStart(createPointerEvent(400));
    });

    const moveHandler = addSpy.mock.calls.find(
      ([event]) => event === "pointermove",
    )?.[1] as (e: PointerEvent) => void;

    act(() => {
      moveHandler(new PointerEvent("pointermove", { clientY: 800 }));
    });

    expect(result.current.resultsHeight).toBe(160);
  });

  it("drag: clamps height to max (container-based)", () => {
    const ref = createMockRef(800);
    const { result } = renderHook(() =>
      useResultsPaneResize({ workspaceRef: ref, initialHeight: 280 }),
    );

    act(() => {
      result.current.handleResultsResizeStart(createPointerEvent(400));
    });

    const moveHandler = addSpy.mock.calls.find(
      ([event]) => event === "pointermove",
    )?.[1] as (e: PointerEvent) => void;

    act(() => {
      moveHandler(new PointerEvent("pointermove", { clientY: -500 }));
    });

    const maxHeight = Math.max(160, Math.min(560, 800 - 120));
    expect(result.current.resultsHeight).toBe(maxHeight);
  });

  it("pointer up: removes listeners, sets isResizing=false", () => {
    const ref = createMockRef();
    const { result } = renderHook(() =>
      useResultsPaneResize({ workspaceRef: ref }),
    );

    act(() => {
      result.current.handleResultsResizeStart(createPointerEvent(400));
    });

    expect(result.current.isResizingResults).toBe(true);

    const upHandler = addSpy.mock.calls.find(
      ([event]) => event === "pointerup",
    )?.[1] as (e: PointerEvent) => void;

    act(() => {
      upHandler(new PointerEvent("pointerup"));
    });

    expect(result.current.isResizingResults).toBe(false);
    expect(removeSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("pointerup", expect.any(Function));
  });
});
