import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockToast } from "@/test/mocks/sonner";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  default: apiMocks,
}));

import { useAuditLogExport } from "../use-audit-export";

describe("useAuditLogExport", () => {
  let clickSpy: ReturnType<typeof vi.fn>;
  let createdLinks: HTMLAnchorElement[];
  const OriginalBlob = globalThis.Blob;

  beforeEach(() => {
    vi.resetAllMocks();

    clickSpy = vi.fn();
    createdLinks = [];

    globalThis.Blob = class FakeBlob {
      constructor(_parts: BlobPart[], _options?: BlobPropertyBag) {}
    } as unknown as typeof Blob;

    globalThis.URL.createObjectURL = vi.fn(() => "blob:fake-url");
    globalThis.URL.revokeObjectURL = vi.fn();

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(
      (tagName, options) => {
        const element = originalCreateElement(tagName, options);
        if (tagName === "a") {
          createdLinks.push(element as HTMLAnchorElement);
          vi.spyOn(element as HTMLAnchorElement, "click").mockImplementation(
            clickSpy,
          );
        }
        return element;
      },
    );
  });

  afterEach(() => {
    globalThis.Blob = OriginalBlob;
    vi.restoreAllMocks();
  });

  it("includes filter params in the export request and toasts success", async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: { items: [], total: 0, page: 1, pageSize: 10000 },
    });

    const { result } = renderHook(() =>
      useAuditLogExport({
        eventType: "auth.login",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
        search: "alice",
        sortBy: "createdAt",
        sortDir: "desc",
      }),
    );

    await act(async () => {
      await result.current.exportCsv();
    });

    expect(apiMocks.get).toHaveBeenCalledOnce();
    const [url] = apiMocks.get.mock.calls[0] ?? [];
    expect(String(url)).toContain("/audit-logs?");
    expect(String(url)).toContain("page=1");
    expect(String(url)).toContain("pageSize=10000");
    expect(String(url)).toContain("eventType=auth.login");
    expect(String(url)).toContain("dateFrom=2026-01-01");
    expect(String(url)).toContain("dateTo=2026-01-31");
    expect(String(url)).toContain("search=alice");
    expect(String(url)).toContain("sortBy=createdAt");
    expect(String(url)).toContain("sortDir=desc");

    expect(createdLinks).toHaveLength(1);
    expect(createdLinks[0]?.download).toContain("audit-log-export");
    expect(clickSpy).toHaveBeenCalled();

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Exported 0 audit events");
    });
  });

  it("toasts an error when the export request fails", async () => {
    apiMocks.get.mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(() =>
      useAuditLogExport({
        eventType: null,
        dateFrom: null,
        dateTo: null,
        search: null,
        sortBy: null,
        sortDir: null,
      }),
    );

    await act(async () => {
      await result.current.exportCsv();
    });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "Failed to export audit logs",
      );
    });
  });
});
