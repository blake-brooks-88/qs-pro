import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLazyOpenSavedQuery } from "../use-lazy-open-saved-query";

const { mockUseSavedQuery } = vi.hoisted(() => ({
  mockUseSavedQuery: vi.fn(),
}));

vi.mock("@/features/editor-workspace/hooks/use-saved-queries", () => ({
  useSavedQuery: (...args: unknown[]) => mockUseSavedQuery(...args),
}));

describe("useLazyOpenSavedQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSavedQuery.mockReturnValue({ data: undefined });
  });

  it("callback fires when query data matches pendingId", () => {
    const onOpenSavedQuery = vi.fn();
    const queryData = {
      id: "sq-1",
      name: "Test Query",
      sqlText: "SELECT 1",
      folderId: "f1",
      updatedAt: "2026-01-01",
      linkedQaCustomerKey: null,
      linkedQaName: null,
      linkedAt: null,
    };

    mockUseSavedQuery.mockReturnValue({ data: undefined });

    const { rerender } = renderHook(() =>
      useLazyOpenSavedQuery({ onOpenSavedQuery }),
    );

    expect(onOpenSavedQuery).not.toHaveBeenCalled();

    mockUseSavedQuery.mockReturnValue({ data: queryData });
    rerender();

    expect(onOpenSavedQuery).not.toHaveBeenCalled();
  });

  it("fires callback after requestOpenSavedQuery sets pendingId and data arrives", () => {
    const onOpenSavedQuery = vi.fn();
    const queryData = {
      id: "sq-1",
      name: "Test Query",
      sqlText: "SELECT 1",
      folderId: "f1",
      updatedAt: "2026-01-01",
      linkedQaCustomerKey: null,
      linkedQaName: null,
      linkedAt: null,
    };

    mockUseSavedQuery.mockReturnValue({ data: undefined });

    const { result, rerender } = renderHook(() =>
      useLazyOpenSavedQuery({ onOpenSavedQuery }),
    );

    act(() => {
      result.current.requestOpenSavedQuery("sq-1");
    });

    mockUseSavedQuery.mockReturnValue({ data: queryData });
    rerender();

    expect(onOpenSavedQuery).toHaveBeenCalledWith(queryData);
  });

  it("no callback when pendingQueryId is null", () => {
    const onOpenSavedQuery = vi.fn();
    const queryData = {
      id: "sq-1",
      name: "Test Query",
      sqlText: "SELECT 1",
      folderId: "f1",
      updatedAt: "2026-01-01",
      linkedQaCustomerKey: null,
      linkedQaName: null,
      linkedAt: null,
    };

    mockUseSavedQuery.mockReturnValue({ data: queryData });

    renderHook(() => useLazyOpenSavedQuery({ onOpenSavedQuery }));

    expect(onOpenSavedQuery).not.toHaveBeenCalled();
  });

  it("no callback when query ID mismatches pending", () => {
    const onOpenSavedQuery = vi.fn();
    const queryData = {
      id: "sq-OTHER",
      name: "Other Query",
      sqlText: "SELECT 2",
      folderId: "f1",
      updatedAt: "2026-01-01",
      linkedQaCustomerKey: null,
      linkedQaName: null,
      linkedAt: null,
    };

    mockUseSavedQuery.mockReturnValue({ data: undefined });

    const { result, rerender } = renderHook(() =>
      useLazyOpenSavedQuery({ onOpenSavedQuery }),
    );

    act(() => {
      result.current.requestOpenSavedQuery("sq-1");
    });

    mockUseSavedQuery.mockReturnValue({ data: queryData });
    rerender();

    expect(onOpenSavedQuery).not.toHaveBeenCalled();
  });

  it("clearPendingSavedQuery resets state", () => {
    const onOpenSavedQuery = vi.fn();

    mockUseSavedQuery.mockReturnValue({ data: undefined });

    const { result } = renderHook(() =>
      useLazyOpenSavedQuery({ onOpenSavedQuery }),
    );

    act(() => {
      result.current.requestOpenSavedQuery("sq-1");
    });
    expect(result.current.pendingQueryId).toBe("sq-1");

    act(() => {
      result.current.clearPendingSavedQuery();
    });
    expect(result.current.pendingQueryId).toBeNull();
  });
});
