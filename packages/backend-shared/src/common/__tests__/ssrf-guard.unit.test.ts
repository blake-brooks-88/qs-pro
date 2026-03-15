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

    it("returns an error for IPv4 private IP literal hostnames", () => {
      expect(validateWebhookUrl("https://192.168.1.1/hook")).toMatch(
        /private/i,
      );
      expect(validateWebhookUrl("https://10.0.0.1/hook")).toMatch(/private/i);
    });

    it("returns an error for IPv6 loopback literal hostnames", () => {
      expect(validateWebhookUrl("https://[::1]/hook")).toMatch(/private/i);
    });

    it("returns an error for IPv4-mapped IPv6 literal hostnames", () => {
      expect(validateWebhookUrl("https://[::ffff:10.0.0.1]/hook")).toMatch(
        /private/i,
      );
    });

    it("allows public IP literal hostnames", () => {
      expect(validateWebhookUrl("https://93.184.216.34/hook")).toBeNull();
    });
  });

  describe("assertPublicHostname", () => {
    it("throws when hostname matches a private/internal pattern", async () => {
      await expect(
        assertPublicHostname("https://localhost/hook"),
      ).rejects.toThrow(/SSRF blocked/i);
      expect(mockLookup).not.toHaveBeenCalled();
    });

    it("throws for link-local IPv6 (including zone indices)", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "fe80::1%lo0", family: 6 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).rejects.toThrow(/SSRF blocked/i);
    });

    it("throws for unique-local IPv6 addresses", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "fd12:3456:789a::1", family: 6 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).rejects.toThrow(/SSRF blocked/i);
    });

    it("throws for carrier-grade NAT IPv4 range (100.64.0.0/10)", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "100.64.12.34", family: 4 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).rejects.toThrow(/SSRF blocked/i);
    });

    it("throws when DNS resolves to a private IP", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "10.0.0.5", family: 4 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).rejects.toThrow(/SSRF blocked/i);
    });

    it("throws when any DNS record resolves to a private IP", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.0.10", family: 4 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).rejects.toThrow(/SSRF blocked/i);
    });

    it("ignores non-IP DNS records and succeeds if no private IPs are present", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "not-an-ip", family: 4 },
        { address: "93.184.216.34", family: 4 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).resolves.toBeUndefined();
    });

    it("throws for IPv4-mapped IPv6 private addresses", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "::ffff:127.0.0.1", family: 6 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).rejects.toThrow(/SSRF blocked/i);
    });

    it("blocks 172.16.0.0/12 but allows other 172.* ranges", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "172.16.0.1", family: 4 },
      ]);
      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).rejects.toThrow(/SSRF blocked/i);

      mockLookup.mockImplementationOnce(async () => [
        { address: "172.32.0.1", family: 4 },
      ]);
      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).resolves.toBeUndefined();
    });

    it("blocks unspecified IPv6 (::)", async () => {
      mockLookup.mockImplementationOnce(async () => [
        { address: "::", family: 6 },
      ]);

      await expect(
        assertPublicHostname("https://example.com/hook"),
      ).rejects.toThrow(/SSRF blocked/i);
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
