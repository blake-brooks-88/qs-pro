import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportAuditLogCsv } from "../use-audit-export";
import type { AuditLogItem } from "../use-audit-logs";

function makeItem(overrides: Partial<AuditLogItem> = {}): AuditLogItem {
  return {
    id: "item-1",
    tenantId: "t-1",
    mid: "12345",
    eventType: "auth.login",
    actorType: "user",
    actorId: "user-1",
    actorName: "Test User",
    actorEmail: "test@example.com",
    targetId: "resource-1",
    targetName: null,
    targetEmail: null,
    metadata: null,
    ipAddress: "127.0.0.1",
    userAgent: "TestAgent",
    createdAt: "2026-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("exportAuditLogCsv", () => {
  let capturedCsvContent: string;
  let capturedBlobType: string;
  let clickSpy: ReturnType<typeof vi.fn>;
  let createdLink: HTMLAnchorElement;
  const OriginalBlob = globalThis.Blob;

  beforeEach(() => {
    capturedCsvContent = "";
    capturedBlobType = "";
    clickSpy = vi.fn();

    createdLink = {
      href: "",
      download: "",
      style: { display: "" },
      click: clickSpy,
    } as unknown as HTMLAnchorElement;

    globalThis.Blob = class FakeBlob {
      type: string;
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        capturedCsvContent = parts.map(String).join("");
        this.type = options?.type ?? "";
        capturedBlobType = this.type;
      }
    } as unknown as typeof Blob;

    globalThis.URL.createObjectURL = vi.fn(() => "blob:fake-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue(createdLink);
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
  });

  afterEach(() => {
    globalThis.Blob = OriginalBlob;
    vi.restoreAllMocks();
  });

  it("creates a Blob with CSV content type", () => {
    exportAuditLogCsv([makeItem()], "export.csv");

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(capturedBlobType).toBe("text/csv;charset=utf-8;");
  });

  it("escapes values containing commas", () => {
    exportAuditLogCsv([makeItem({ eventType: "auth,login" })], "export.csv");

    const dataRow = capturedCsvContent.split("\n")[1] ?? "";
    expect(dataRow).toContain('"auth,login"');
  });

  it("escapes values containing double quotes", () => {
    exportAuditLogCsv([makeItem({ eventType: 'say "hello"' })], "export.csv");

    expect(capturedCsvContent).toContain('"say ""hello"""');
  });

  it("escapes values containing newlines", () => {
    exportAuditLogCsv([makeItem({ targetId: "line1\nline2" })], "export.csv");

    expect(capturedCsvContent).toContain('"line1\nline2"');
  });

  it("substitutes System for null actorId", () => {
    exportAuditLogCsv(
      [makeItem({ actorId: null, actorName: null, actorEmail: null })],
      "export.csv",
    );

    const dataRow = capturedCsvContent.split("\n")[1];
    const actorColumn = dataRow?.split(",")[1];
    expect(actorColumn).toBe("System");
  });

  it("sets correct download filename on the link", () => {
    exportAuditLogCsv([makeItem()], "my-audit-log.csv");

    expect(createdLink.download).toBe("my-audit-log.csv");
  });

  it("cleans up by revoking the object URL", () => {
    exportAuditLogCsv([makeItem()], "export.csv");

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });
});
