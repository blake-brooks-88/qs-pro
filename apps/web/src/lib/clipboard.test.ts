import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
  let originalExecCommand: typeof document.execCommand | undefined;

  beforeEach(() => {
    // jsdom doesn't implement execCommand — polyfill it so vi.spyOn works.
    originalExecCommand = document.execCommand;
    if (!document.execCommand) {
      document.execCommand = vi.fn().mockReturnValue(false);
    }
  });

  afterEach(() => {
    if (originalExecCommand === undefined) {
      // @ts-expect-error - cleaning up polyfill
      delete document.execCommand;
    }
    vi.restoreAllMocks();
  });

  it("should return true when execCommand succeeds", async () => {
    vi.spyOn(document, "execCommand").mockReturnValue(true);

    expect(await copyToClipboard("hello")).toBe(true);
  });

  it("should return false when execCommand fails and no clipboard API", async () => {
    vi.spyOn(document, "execCommand").mockReturnValue(false);
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    expect(await copyToClipboard("hello")).toBe(false);
  });

  it("should use navigator.clipboard when execCommand fails", async () => {
    vi.spyOn(document, "execCommand").mockReturnValue(false);
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    expect(await copyToClipboard("hello")).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("hello");
  });

  it("should return false when both methods fail", async () => {
    vi.spyOn(document, "execCommand").mockReturnValue(false);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    expect(await copyToClipboard("hello")).toBe(false);
  });
});
