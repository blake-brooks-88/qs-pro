import { promises as dns } from "node:dns";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns", () => ({
  promises: {
    lookup: vi.fn(),
  },
}));

import {
  assertPublicHostname,
  isPrivateHostname,
  validateWebhookUrl,
} from "../ssrf-guard";

const mockLookup = dns.lookup as unknown as ReturnType<typeof vi.fn>;

describe("ssrf-guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isPrivateHostname", () => {
    it("returns true for common private/internal hostnames", () => {
      expect(isPrivateHostname("localhost")).toBe(true);
      expect(isPrivateHostname("127.0.0.1")).toBe(true);
      expect(isPrivateHostname("10.0.0.1")).toBe(true);
      expect(isPrivateHostname("172.16.0.1")).toBe(true);
      expect(isPrivateHostname("192.168.1.1")).toBe(true);
      expect(isPrivateHostname("169.254.1.1")).toBe(true);
      expect(isPrivateHostname("service.internal")).toBe(true);
      expect(isPrivateHostname("mybox.local")).toBe(true);
      expect(isPrivateHostname("::1")).toBe(true);
    });

    it("returns false for public hostnames", () => {
      expect(isPrivateHostname("example.com")).toBe(false);
      expect(isPrivateHostname("api.qs-pro.com")).toBe(false);
    });
  });

  describe("validateWebhookUrl", () => {
    it("returns an error message for invalid URLs", () => {
      expect(validateWebhookUrl("not a url")).toBe("Invalid URL");
    });

    it("returns an error message for private/internal hostnames", () => {
      expect(validateWebhookUrl("https://localhost/hook")).toMatch(
        /private\/internal network/i,
      );
    });

    it("returns null for a valid public URL", () => {
      expect(validateWebhookUrl("https://example.com/hook")).toBeNull();
    });
  });

  describe("assertPublicHostname", () => {
    it("throws when hostname matches a private/internal pattern", async () => {
      await expect(
        assertPublicHostname("https://localhost/hook"),
      ).rejects.toThrow(/SSRF blocked/i);
      expect(mockLookup).not.toHaveBeenCalled();
    });

    it("throws when DNS resolves to a private IP", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "10.0.0.5", family: 4 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).rejects.toThrow(/resolves to private IP/i);
    });

    it("throws when any DNS record resolves to a private IP", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.0.10", family: 4 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).rejects.toThrow(/resolves to private IP/i);
    });

    it("throws for IPv4-mapped IPv6 private addresses", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "::ffff:127.0.0.1", family: 6 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).rejects.toThrow(/resolves to private IP/i);
    });

    it("resolves when DNS resolves to a public IP", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "93.184.216.34", family: 4 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).resolves.toBeUndefined();
    });
  });
});
