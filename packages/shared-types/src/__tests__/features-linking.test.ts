import { describe, expect, it } from "vitest";

import { getTierFeatures, isTierFeature, TIER_FEATURES } from "../index";

describe("querySharing feature tiering", () => {
  it("querySharing is NOT in the free tier", () => {
    expect(TIER_FEATURES.free).not.toContain("querySharing");
  });

  it("querySharing IS in the pro tier", () => {
    expect(TIER_FEATURES.pro).toContain("querySharing");
  });

  it("querySharing IS in the enterprise tier", () => {
    expect(TIER_FEATURES.enterprise).toContain("querySharing");
  });
});

describe("deployToAutomation feature tiering", () => {
  it("deployToAutomation is NOT in the free tier", () => {
    expect(TIER_FEATURES.free).not.toContain("deployToAutomation");
  });

  it("deployToAutomation IS in the pro tier", () => {
    expect(TIER_FEATURES.pro).toContain("deployToAutomation");
  });

  it("deployToAutomation IS in the enterprise tier", () => {
    expect(TIER_FEATURES.enterprise).toContain("deployToAutomation");
  });
});

describe("getTierFeatures", () => {
  it("returns querySharing: true for pro tier", () => {
    const features = getTierFeatures("pro");
    expect(features.querySharing).toBe(true);
  });

  it("returns querySharing: false for free tier", () => {
    const features = getTierFeatures("free");
    expect(features.querySharing).toBe(false);
  });

  it("returns deployToAutomation: true for enterprise tier", () => {
    const features = getTierFeatures("enterprise");
    expect(features.deployToAutomation).toBe(true);
  });

  it("returns deployToAutomation: false for free tier", () => {
    const features = getTierFeatures("free");
    expect(features.deployToAutomation).toBe(false);
  });
});

describe("isTierFeature", () => {
  it("returns true for querySharing on pro tier", () => {
    expect(isTierFeature("pro", "querySharing")).toBe(true);
  });

  it("returns false for querySharing on free tier", () => {
    expect(isTierFeature("free", "querySharing")).toBe(false);
  });

  it("returns true for querySharing on enterprise tier", () => {
    expect(isTierFeature("enterprise", "querySharing")).toBe(true);
  });

  it("returns true for basicLinting on free tier", () => {
    expect(isTierFeature("free", "basicLinting")).toBe(true);
  });

  it("returns false for deployToAutomation on free tier", () => {
    expect(isTierFeature("free", "deployToAutomation")).toBe(false);
  });
});
