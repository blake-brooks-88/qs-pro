import { describe, it, expect } from "vitest";
import { TIER_FEATURES, FeatureKey } from "../features";

describe("TIER_FEATURES inheritance", () => {
  it("pro tier includes all free tier features", () => {
    // Arrange
    const freeFeatures = TIER_FEATURES.free;
    const proFeatures = TIER_FEATURES.pro;

    // Assert
    for (const feature of freeFeatures) {
      expect(proFeatures).toContain(feature);
    }
  });

  it("enterprise tier includes all pro tier features", () => {
    // Arrange
    const proFeatures = TIER_FEATURES.pro;
    const enterpriseFeatures = TIER_FEATURES.enterprise;

    // Assert
    for (const feature of proFeatures) {
      expect(enterpriseFeatures).toContain(feature);
    }
  });

  it("enterprise tier includes all free tier features", () => {
    // Arrange
    const freeFeatures = TIER_FEATURES.free;
    const enterpriseFeatures = TIER_FEATURES.enterprise;

    // Assert
    for (const feature of freeFeatures) {
      expect(enterpriseFeatures).toContain(feature);
    }
  });

  it("each tier has unique additional features", () => {
    // Arrange & Assert
    expect(TIER_FEATURES.free.length).toBeGreaterThan(0);
    expect(TIER_FEATURES.pro.length).toBeGreaterThan(TIER_FEATURES.free.length);
    expect(TIER_FEATURES.enterprise.length).toBeGreaterThan(
      TIER_FEATURES.pro.length,
    );
  });
});
