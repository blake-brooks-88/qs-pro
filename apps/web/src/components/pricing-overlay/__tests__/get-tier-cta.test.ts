import { describe, expect, it } from "vitest";

import { getTierCta } from "../get-tier-cta";

describe("getTierCta", () => {
  describe("free user viewing cards", () => {
    it("shows default CTA on Free card", () => {
      const result = getTierCta("free", "free", false, "Current Plan");
      expect(result.text).toBe("Current Plan");
      expect(result.disabled).toBe(true);
    });

    it("shows 'Upgrade to Pro' on Pro card", () => {
      const result = getTierCta("pro", "free", false, "Upgrade to Pro");
      expect(result.text).toBe("Upgrade to Pro");
      expect(result.disabled).toBe(false);
    });

    it("shows 'Contact Sales' on Enterprise card", () => {
      const result = getTierCta("enterprise", "free", false, "Contact Sales");
      expect(result.text).toBe("Contact Sales");
      expect(result.disabled).toBe(false);
    });
  });

  describe("trial user viewing cards", () => {
    it("shows 'Subscribe to Pro' on Pro card (not 'Current Plan')", () => {
      const result = getTierCta("pro", "pro", true, "Upgrade to Pro");
      expect(result.text).toBe("Subscribe to Pro");
      expect(result.disabled).toBe(false);
    });

    it("does not treat Free card as current", () => {
      const result = getTierCta("free", "pro", true, "Current Plan");
      expect(result.text).toBe("Current Plan");
      expect(result.disabled).toBe(false);
    });

    it("shows 'Contact Sales' on Enterprise card", () => {
      const result = getTierCta("enterprise", "pro", true, "Contact Sales");
      expect(result.text).toBe("Contact Sales");
      expect(result.disabled).toBe(false);
    });
  });

  describe("paid Pro user viewing cards", () => {
    it("shows 'Current Plan' disabled on Pro card", () => {
      const result = getTierCta("pro", "pro", false, "Upgrade to Pro");
      expect(result.text).toBe("Current Plan");
      expect(result.disabled).toBe(true);
    });

    it("shows default CTA on Free card", () => {
      const result = getTierCta("free", "pro", false, "Current Plan");
      expect(result.text).toBe("Current Plan");
      expect(result.disabled).toBe(false);
    });
  });

  describe("enterprise user viewing cards", () => {
    it("shows 'Current Plan' disabled on Enterprise card", () => {
      const result = getTierCta("enterprise", "enterprise", false, "Contact Sales");
      expect(result.text).toBe("Current Plan");
      expect(result.disabled).toBe(true);
    });

    it("shows default CTA on Pro card", () => {
      const result = getTierCta("pro", "enterprise", false, "Upgrade to Pro");
      expect(result.text).toBe("Upgrade to Pro");
      expect(result.disabled).toBe(false);
    });
  });
});
