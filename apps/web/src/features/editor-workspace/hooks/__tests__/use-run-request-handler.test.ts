import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useRunRequestHandler } from "../use-run-request-handler";

describe("useRunRequestHandler", () => {
  it("does nothing when already running", () => {
    const execute = vi.fn(async () => {});
    const openBlocked = vi.fn();
    const openUpgrade = vi.fn();

    const { result } = renderHook(() =>
      useRunRequestHandler({
        isRunning: true,
        hasBlockingDiagnostics: false,
        isAtRunLimit: false,
        activeTab: { content: "select 1", name: "Query", queryId: "sq-1" },
        execute,
        onOpenRunBlockedDialog: openBlocked,
        onOpenUpgradeModal: openUpgrade,
      }),
    );

    result.current();

    expect(execute).not.toHaveBeenCalled();
    expect(openBlocked).not.toHaveBeenCalled();
    expect(openUpgrade).not.toHaveBeenCalled();
  });

  it("opens run blocked dialog when blocking diagnostics present", () => {
    const execute = vi.fn(async () => {});
    const openBlocked = vi.fn();
    const openUpgrade = vi.fn();

    const { result } = renderHook(() =>
      useRunRequestHandler({
        isRunning: false,
        hasBlockingDiagnostics: true,
        isAtRunLimit: false,
        activeTab: { content: "select 1", name: "Query", queryId: "sq-1" },
        execute,
        onOpenRunBlockedDialog: openBlocked,
        onOpenUpgradeModal: openUpgrade,
      }),
    );

    result.current();

    expect(openBlocked).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(openUpgrade).not.toHaveBeenCalled();
  });

  it("opens upgrade modal when at run limit", () => {
    const execute = vi.fn(async () => {});
    const openBlocked = vi.fn();
    const openUpgrade = vi.fn();

    const { result } = renderHook(() =>
      useRunRequestHandler({
        isRunning: false,
        hasBlockingDiagnostics: false,
        isAtRunLimit: true,
        activeTab: { content: "select 1", name: "Query", queryId: "sq-1" },
        execute,
        onOpenRunBlockedDialog: openBlocked,
        onOpenUpgradeModal: openUpgrade,
      }),
    );

    result.current();

    expect(openUpgrade).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(openBlocked).not.toHaveBeenCalled();
  });

  it("executes query when allowed", () => {
    const execute = vi.fn(async () => {});
    const openBlocked = vi.fn();
    const openUpgrade = vi.fn();

    const { result } = renderHook(() =>
      useRunRequestHandler({
        isRunning: false,
        hasBlockingDiagnostics: false,
        isAtRunLimit: false,
        activeTab: { content: "select 1", name: "Query", queryId: "sq-1" },
        execute,
        onOpenRunBlockedDialog: openBlocked,
        onOpenUpgradeModal: openUpgrade,
      }),
    );

    result.current();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      "select 1",
      "Query",
      undefined,
      undefined,
      "sq-1",
    );
    expect(openBlocked).not.toHaveBeenCalled();
    expect(openUpgrade).not.toHaveBeenCalled();
  });
});
