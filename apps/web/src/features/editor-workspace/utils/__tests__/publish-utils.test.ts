import type { PublishEventListItem, VersionListItem } from "@qpp/shared-types";
import { describe, expect, it } from "vitest";

import { computeVersionGap, derivePublishState } from "../publish-utils";

function makeVersion(id: string, createdAt: string): VersionListItem {
  return {
    id,
    savedQueryId: "sq-1",
    lineCount: 10,
    source: "save" as const,
    restoredFromId: null,
    versionName: null,
    createdAt,
    authorName: null,
  };
}

function makePublishEvent(
  id: string,
  versionId: string,
  createdAt: string,
): PublishEventListItem {
  return {
    id,
    versionId,
    savedQueryId: "sq-1",
    userId: "user-1",
    linkedQaCustomerKey: "qa-key-1",
    publishedSqlHash: "hash-1",
    createdAt,
  };
}

describe("computeVersionGap", () => {
  it("returns 0 when currentPublishedVersionId is null", () => {
    // Arrange
    const versions = [
      makeVersion("v1", "2026-02-01T10:00:00.000Z"),
      makeVersion("v2", "2026-02-02T10:00:00.000Z"),
    ];

    // Act
    const gap = computeVersionGap(versions, null);

    // Assert
    expect(gap).toBe(0);
  });

  it("returns 0 when the published version is the latest version", () => {
    // Arrange
    const versions = [
      makeVersion("v1", "2026-02-01T10:00:00.000Z"),
      makeVersion("v2", "2026-02-02T10:00:00.000Z"),
    ];

    // Act
    const gap = computeVersionGap(versions, "v2");

    // Assert
    expect(gap).toBe(0);
  });

  it("returns 1 when one version is newer than the published version", () => {
    // Arrange
    const versions = [
      makeVersion("v1", "2026-02-01T10:00:00.000Z"),
      makeVersion("v2", "2026-02-02T10:00:00.000Z"),
    ];

    // Act
    const gap = computeVersionGap(versions, "v1");

    // Assert
    expect(gap).toBe(1);
  });

  it("returns 3 when three versions are newer than the published version", () => {
    // Arrange
    const versions = [
      makeVersion("v1", "2026-02-01T10:00:00.000Z"),
      makeVersion("v2", "2026-02-02T10:00:00.000Z"),
      makeVersion("v3", "2026-02-03T10:00:00.000Z"),
      makeVersion("v4", "2026-02-04T10:00:00.000Z"),
    ];

    // Act
    const gap = computeVersionGap(versions, "v1");

    // Assert
    expect(gap).toBe(3);
  });

  it("returns 0 when publishedVersionId does not match any version", () => {
    // Arrange
    const versions = [
      makeVersion("v1", "2026-02-01T10:00:00.000Z"),
      makeVersion("v2", "2026-02-02T10:00:00.000Z"),
    ];

    // Act
    const gap = computeVersionGap(versions, "v-nonexistent");

    // Assert
    expect(gap).toBe(0);
  });

  it("correctly sorts versions by createdAt desc before computing gap", () => {
    // Arrange - versions provided in non-chronological order
    const versions = [
      makeVersion("v3", "2026-02-03T10:00:00.000Z"),
      makeVersion("v1", "2026-02-01T10:00:00.000Z"),
      makeVersion("v2", "2026-02-02T10:00:00.000Z"),
    ];

    // Act
    const gap = computeVersionGap(versions, "v1");

    // Assert - should be 2 regardless of input order (v2 and v3 are newer)
    expect(gap).toBe(2);
  });

  it("returns 0 when the published version is the only version", () => {
    // Arrange
    const versions = [makeVersion("v1", "2026-02-01T10:00:00.000Z")];

    // Act
    const gap = computeVersionGap(versions, "v1");

    // Assert
    expect(gap).toBe(0);
  });

  it("returns 0 for empty versions array", () => {
    // Act
    const gap = computeVersionGap([], "v1");

    // Assert
    expect(gap).toBe(0);
  });
});

describe("derivePublishState", () => {
  it("returns empty state for empty events array", () => {
    // Act
    const state = derivePublishState([]);

    // Assert
    expect(state.currentPublishedVersionId).toBeNull();
    expect(state.publishedVersionIds.size).toBe(0);
    expect(state.publishEventsByVersionId.size).toBe(0);
  });

  it("sets currentPublishedVersionId to first event's versionId", () => {
    // Arrange
    const events = [
      makePublishEvent("pe-1", "v2", "2026-02-10T12:00:00.000Z"),
      makePublishEvent("pe-2", "v1", "2026-02-05T12:00:00.000Z"),
    ];

    // Act
    const state = derivePublishState(events);

    // Assert
    expect(state.currentPublishedVersionId).toBe("v2");
  });

  it("populates publishedVersionIds with all unique versionIds", () => {
    // Arrange
    const events = [
      makePublishEvent("pe-1", "v3", "2026-02-10T12:00:00.000Z"),
      makePublishEvent("pe-2", "v2", "2026-02-08T12:00:00.000Z"),
      makePublishEvent("pe-3", "v1", "2026-02-05T12:00:00.000Z"),
    ];

    // Act
    const state = derivePublishState(events);

    // Assert
    expect(state.publishedVersionIds).toEqual(new Set(["v3", "v2", "v1"]));
  });

  it("groups events by versionId in map", () => {
    // Arrange
    const events = [
      makePublishEvent("pe-1", "v2", "2026-02-10T12:00:00.000Z"),
      makePublishEvent("pe-2", "v1", "2026-02-05T12:00:00.000Z"),
    ];

    // Act
    const state = derivePublishState(events);

    // Assert
    expect(state.publishEventsByVersionId.size).toBe(2);
    expect(state.publishEventsByVersionId.get("v2")).toHaveLength(1);
    expect(state.publishEventsByVersionId.get("v2")?.[0]?.id).toBe("pe-1");
    expect(state.publishEventsByVersionId.get("v1")).toHaveLength(1);
    expect(state.publishEventsByVersionId.get("v1")?.[0]?.id).toBe("pe-2");
  });

  it("handles same version published multiple times", () => {
    // Arrange
    const events = [
      makePublishEvent("pe-3", "v1", "2026-02-10T12:00:00.000Z"),
      makePublishEvent("pe-2", "v1", "2026-02-08T12:00:00.000Z"),
      makePublishEvent("pe-1", "v1", "2026-02-05T12:00:00.000Z"),
    ];

    // Act
    const state = derivePublishState(events);

    // Assert
    expect(state.currentPublishedVersionId).toBe("v1");
    expect(state.publishedVersionIds.size).toBe(1);
    expect(state.publishEventsByVersionId.get("v1")).toHaveLength(3);
  });

  it("handles multiple versions each published once", () => {
    // Arrange
    const events = [
      makePublishEvent("pe-3", "v3", "2026-02-10T12:00:00.000Z"),
      makePublishEvent("pe-2", "v2", "2026-02-08T12:00:00.000Z"),
      makePublishEvent("pe-1", "v1", "2026-02-05T12:00:00.000Z"),
    ];

    // Act
    const state = derivePublishState(events);

    // Assert
    expect(state.currentPublishedVersionId).toBe("v3");
    expect(state.publishedVersionIds.size).toBe(3);
    expect(state.publishEventsByVersionId.get("v3")).toHaveLength(1);
    expect(state.publishEventsByVersionId.get("v2")).toHaveLength(1);
    expect(state.publishEventsByVersionId.get("v1")).toHaveLength(1);
  });

  it("handles single event", () => {
    // Arrange
    const events = [makePublishEvent("pe-1", "v1", "2026-02-10T12:00:00.000Z")];

    // Act
    const state = derivePublishState(events);

    // Assert
    expect(state.currentPublishedVersionId).toBe("v1");
    expect(state.publishedVersionIds).toEqual(new Set(["v1"]));
    expect(state.publishEventsByVersionId.get("v1")).toHaveLength(1);
  });
});
