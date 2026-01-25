import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useClickOutside } from "@/hooks/use-click-outside";

describe("useClickOutside", () => {
  let container: HTMLDivElement;
  let outside: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.setAttribute("data-testid", "container");
    outside = document.createElement("div");
    outside.setAttribute("data-testid", "outside");
    document.body.appendChild(container);
    document.body.appendChild(outside);
  });

  afterEach(() => {
    document.body.removeChild(container);
    document.body.removeChild(outside);
  });

  it("calls handler when clicking outside the element", () => {
    const handler = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, handler);
    });

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not call handler when clicking inside the element", () => {
    const handler = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, handler);
    });

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call handler when clicking on descendant element", () => {
    const child = document.createElement("button");
    container.appendChild(child);
    const handler = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, handler);
    });

    child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("handles touchstart events outside the element", () => {
    const handler = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, handler);
    });

    outside.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not call handler for touchstart inside the element", () => {
    const handler = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, handler);
    });

    container.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("removes event listeners on unmount", () => {
    const handler = vi.fn();
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, handler);
    });

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "mousedown",
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "touchstart",
      expect.any(Function),
    );

    removeEventListenerSpy.mockRestore();
  });

  it("handles null ref without error", () => {
    const handler = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(null);
      useClickOutside(ref, handler);
    });

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("passes the event object to handler", () => {
    const handler = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, handler);
    });

    const event = new MouseEvent("mousedown", { bubbles: true });
    outside.dispatchEvent(event);

    expect(handler).toHaveBeenCalledWith(expect.any(MouseEvent));
  });

  it("updates handler when it changes", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { rerender } = renderHook(
      ({ handler }) => {
        const ref = useRef<HTMLDivElement>(container);
        useClickOutside(ref, handler);
      },
      { initialProps: { handler: handler1 } },
    );

    rerender({ handler: handler2 });

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("handles multiple click events", () => {
    const handler = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, handler);
    });

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(handler).toHaveBeenCalledTimes(3);
  });
});
