import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useStaleDetection } from "../use-stale-detection";

describe("useStaleDetection", () => {
  it("initial state has openedHash as null", () => {
    const { result } = renderHook(() => useStaleDetection());

    expect(result.current.openedHash).toBeNull();
  });

  it("trackOpened stores the hash", () => {
    const { result, rerender } = renderHook(() => useStaleDetection());

    act(() => {
      result.current.trackOpened("abc123");
    });

    rerender();

    expect(result.current.openedHash).toBe("abc123");
  });

  it("openedHash returns the stored hash after trackOpened", () => {
    const { result, rerender } = renderHook(() => useStaleDetection());

    act(() => {
      result.current.trackOpened("hash-xyz");
    });

    rerender();

    expect(result.current.openedHash).toBe("hash-xyz");
  });

  it("updateHash replaces the stored hash", () => {
    const { result, rerender } = renderHook(() => useStaleDetection());

    act(() => {
      result.current.trackOpened("original-hash");
    });

    rerender();

    expect(result.current.openedHash).toBe("original-hash");

    act(() => {
      result.current.updateHash("updated-hash");
    });

    rerender();

    expect(result.current.openedHash).toBe("updated-hash");
  });

  it("multiple calls to trackOpened update the hash (latest wins)", () => {
    const { result, rerender } = renderHook(() => useStaleDetection());

    act(() => {
      result.current.trackOpened("first");
      result.current.trackOpened("second");
      result.current.trackOpened("third");
    });

    rerender();

    expect(result.current.openedHash).toBe("third");
  });

  it("clearHash resets openedHash to null", () => {
    const { result, rerender } = renderHook(() => useStaleDetection());

    act(() => {
      result.current.trackOpened("some-hash");
    });

    rerender();

    expect(result.current.openedHash).toBe("some-hash");

    act(() => {
      result.current.clearHash();
    });

    rerender();

    expect(result.current.openedHash).toBeNull();
  });

  it("callback references remain stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useStaleDetection());

    const firstTrackOpened = result.current.trackOpened;
    const firstUpdateHash = result.current.updateHash;
    const firstClearHash = result.current.clearHash;

    rerender();

    expect(result.current.trackOpened).toBe(firstTrackOpened);
    expect(result.current.updateHash).toBe(firstUpdateHash);
    expect(result.current.clearHash).toBe(firstClearHash);
  });
});
