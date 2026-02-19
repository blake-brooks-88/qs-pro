import { renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFormatQuery } from "@/features/editor-workspace/hooks/use-format-query";
import { formatSql } from "@/features/editor-workspace/utils/format-sql";

vi.mock("sonner", () => ({
  toast: { warning: vi.fn() },
}));

vi.mock("@/features/editor-workspace/utils/format-sql", () => ({
  formatSql: vi.fn((sql: string) => `FORMATTED: ${sql}`),
}));

describe("useFormatQuery", () => {
  const mockStoreUpdateTabContent = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(formatSql).mockImplementation(
      (sql: string) => `FORMATTED: ${sql}`,
    );
  });

  it("calls storeUpdateTabContent with formatted result on success", () => {
    const { result } = renderHook(() =>
      useFormatQuery({
        activeTabId: "tab-1",
        activeTabContent: "select * from [DE]",
        storeUpdateTabContent: mockStoreUpdateTabContent,
      }),
    );

    result.current.handleFormat();

    expect(formatSql).toHaveBeenCalledWith("select * from [DE]");
    expect(mockStoreUpdateTabContent).toHaveBeenCalledWith(
      "tab-1",
      "FORMATTED: select * from [DE]",
    );
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("shows toast warning and does not update content for empty editor", () => {
    const { result } = renderHook(() =>
      useFormatQuery({
        activeTabId: "tab-1",
        activeTabContent: "",
        storeUpdateTabContent: mockStoreUpdateTabContent,
      }),
    );

    result.current.handleFormat();

    expect(toast.warning).toHaveBeenCalledWith("No SQL to format");
    expect(mockStoreUpdateTabContent).not.toHaveBeenCalled();
  });

  it("shows toast warning and does not update content for whitespace-only editor", () => {
    const { result } = renderHook(() =>
      useFormatQuery({
        activeTabId: "tab-1",
        activeTabContent: "   \n\t  ",
        storeUpdateTabContent: mockStoreUpdateTabContent,
      }),
    );

    result.current.handleFormat();

    expect(toast.warning).toHaveBeenCalledWith("No SQL to format");
    expect(mockStoreUpdateTabContent).not.toHaveBeenCalled();
  });

  it("does nothing when activeTabId is null", () => {
    const { result } = renderHook(() =>
      useFormatQuery({
        activeTabId: null,
        activeTabContent: "select * from [DE]",
        storeUpdateTabContent: mockStoreUpdateTabContent,
      }),
    );

    result.current.handleFormat();

    expect(toast.warning).not.toHaveBeenCalled();
    expect(mockStoreUpdateTabContent).not.toHaveBeenCalled();
    expect(formatSql).not.toHaveBeenCalled();
  });

  it("shows error toast and does not update content when formatSql throws", () => {
    vi.mocked(formatSql).mockImplementation(() => {
      throw new Error("Parse failure");
    });

    const { result } = renderHook(() =>
      useFormatQuery({
        activeTabId: "tab-1",
        activeTabContent: "select * from [DE]",
        storeUpdateTabContent: mockStoreUpdateTabContent,
      }),
    );

    result.current.handleFormat();

    expect(toast.warning).toHaveBeenCalledWith("Could not format query");
    expect(mockStoreUpdateTabContent).not.toHaveBeenCalled();
  });

  it("passes raw content to formatSql, not the trimmed version", () => {
    const rawContent = "  select * from [DE]  ";

    const { result } = renderHook(() =>
      useFormatQuery({
        activeTabId: "tab-1",
        activeTabContent: rawContent,
        storeUpdateTabContent: mockStoreUpdateTabContent,
      }),
    );

    result.current.handleFormat();

    expect(formatSql).toHaveBeenCalledWith(rawContent);
  });
});
