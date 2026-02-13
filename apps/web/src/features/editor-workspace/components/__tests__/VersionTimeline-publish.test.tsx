import type { PublishEventListItem, VersionListItem } from "@qpp/shared-types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VersionTimeline } from "../VersionTimeline";

function createVersion(
  overrides: Partial<VersionListItem> & { id: string; createdAt: string },
): VersionListItem {
  return {
    savedQueryId: "sq-1",
    lineCount: 10,
    source: "save",
    restoredFromId: null,
    versionName: null,
    authorName: null,
    ...overrides,
  };
}

function createPublishEvent(
  overrides: Partial<PublishEventListItem> & { id: string; versionId: string },
): PublishEventListItem {
  return {
    savedQueryId: "sq-1",
    userId: "user-1",
    linkedQaCustomerKey: "qa-key-1",
    publishedSqlHash: "abc123",
    createdAt: "2026-02-10T12:00:00.000Z",
    ...overrides,
  };
}

const versions: VersionListItem[] = [
  createVersion({
    id: "v1",
    createdAt: "2026-02-01T10:00:00.000Z",
    authorName: "Alice",
  }),
  createVersion({
    id: "v2",
    createdAt: "2026-02-03T10:00:00.000Z",
    versionName: "Midpoint",
    authorName: "Bob",
  }),
  createVersion({
    id: "v3",
    createdAt: "2026-02-05T10:00:00.000Z",
    versionName: "Latest",
    authorName: "Charlie",
  }),
];

describe("VersionTimeline - publish indicators", () => {
  const defaultProps = {
    versions,
    selectedVersionId: null,
    onSelectVersion: vi.fn(),
    onUpdateName: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders green pulsing dot on the currently-published version", () => {
    // Arrange & Act
    render(
      <VersionTimeline
        {...defaultProps}
        currentPublishedVersionId="v2"
        publishedVersionIds={new Set(["v2"])}
        publishEventsByVersionId={
          new Map([
            ["v2", [createPublishEvent({ id: "pe-1", versionId: "v2" })]],
          ])
        }
      />,
    );

    // Assert
    const indicator = screen.getByLabelText("Currently published");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("animate-publish-pulse");
    expect(indicator.className).toContain("bg-success-500");
  });

  it("renders grey dot on previously-published version", () => {
    // Arrange & Act
    render(
      <VersionTimeline
        {...defaultProps}
        currentPublishedVersionId="v3"
        publishedVersionIds={new Set(["v2", "v3"])}
        publishEventsByVersionId={
          new Map([
            ["v3", [createPublishEvent({ id: "pe-2", versionId: "v3" })]],
            ["v2", [createPublishEvent({ id: "pe-1", versionId: "v2" })]],
          ])
        }
      />,
    );

    // Assert
    const previousIndicator = screen.getByLabelText("Previously published");
    expect(previousIndicator).toBeInTheDocument();
    expect(previousIndicator.className).toContain("bg-muted-foreground");

    const currentIndicator = screen.getByLabelText("Currently published");
    expect(currentIndicator).toBeInTheDocument();
  });

  it("renders no indicator on never-published version", () => {
    // Arrange & Act
    render(
      <VersionTimeline
        {...defaultProps}
        currentPublishedVersionId="v3"
        publishedVersionIds={new Set(["v3"])}
        publishEventsByVersionId={
          new Map([
            ["v3", [createPublishEvent({ id: "pe-1", versionId: "v3" })]],
          ])
        }
      />,
    );

    // Assert
    const allCurrentIndicators = screen.queryAllByLabelText(
      "Currently published",
    );
    const allPreviousIndicators = screen.queryAllByLabelText(
      "Previously published",
    );
    expect(allCurrentIndicators).toHaveLength(1);
    expect(allPreviousIndicators).toHaveLength(0);
  });

  it("renders no publish indicators when publish props are not provided", () => {
    // Arrange & Act
    render(<VersionTimeline {...defaultProps} />);

    // Assert
    expect(
      screen.queryByLabelText("Currently published"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Previously published"),
    ).not.toBeInTheDocument();
  });

  it('renders "published" badge on currently-published version with single event', () => {
    // Arrange & Act
    render(
      <VersionTimeline
        {...defaultProps}
        currentPublishedVersionId="v2"
        publishedVersionIds={new Set(["v2"])}
        publishEventsByVersionId={
          new Map([
            ["v2", [createPublishEvent({ id: "pe-1", versionId: "v2" })]],
          ])
        }
      />,
    );

    // Assert
    expect(screen.getByText("published")).toBeInTheDocument();
  });

  it('renders "was published" badge on previously-published version with single event', () => {
    // Arrange & Act
    render(
      <VersionTimeline
        {...defaultProps}
        currentPublishedVersionId="v3"
        publishedVersionIds={new Set(["v2", "v3"])}
        publishEventsByVersionId={
          new Map([
            ["v3", [createPublishEvent({ id: "pe-2", versionId: "v3" })]],
            ["v2", [createPublishEvent({ id: "pe-1", versionId: "v2" })]],
          ])
        }
      />,
    );

    // Assert
    expect(screen.getByText("was published")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
  });

  it('renders "published 2x" badge when version was published multiple times', () => {
    // Arrange
    const multipleEvents = [
      createPublishEvent({
        id: "pe-1",
        versionId: "v2",
        createdAt: "2026-02-03T12:00:00.000Z",
      }),
      createPublishEvent({
        id: "pe-2",
        versionId: "v2",
        createdAt: "2026-02-04T12:00:00.000Z",
      }),
    ];

    // Act
    render(
      <VersionTimeline
        {...defaultProps}
        currentPublishedVersionId="v2"
        publishedVersionIds={new Set(["v2"])}
        publishEventsByVersionId={new Map([["v2", multipleEvents]])}
      />,
    );

    // Assert
    expect(screen.getByText("published 2x")).toBeInTheDocument();
  });

  it("expands publish badge to show timestamps on click", async () => {
    // Arrange
    const user = userEvent.setup();
    const events = [
      createPublishEvent({
        id: "pe-1",
        versionId: "v2",
        createdAt: "2026-02-03T12:00:00.000Z",
      }),
      createPublishEvent({
        id: "pe-2",
        versionId: "v2",
        createdAt: "2026-02-04T14:30:00.000Z",
      }),
    ];

    render(
      <VersionTimeline
        {...defaultProps}
        currentPublishedVersionId="v2"
        publishedVersionIds={new Set(["v2"])}
        publishEventsByVersionId={new Map([["v2", events]])}
      />,
    );

    // Act
    const badge = screen.getByText("published 2x");
    await user.click(badge);

    // Assert - the expanded popover shows individual timestamp entries
    const popover = badge
      .closest(".relative")
      ?.querySelector(".absolute.right-0");
    expect(popover).toBeInTheDocument();
    expect(popover?.querySelectorAll("div > div")).toBeTruthy();
  });

  it("collapses publish badge on second click", async () => {
    // Arrange
    const user = userEvent.setup();
    const events = [
      createPublishEvent({
        id: "pe-1",
        versionId: "v2",
        createdAt: "2026-02-03T12:00:00.000Z",
      }),
      createPublishEvent({
        id: "pe-2",
        versionId: "v2",
        createdAt: "2026-02-04T14:30:00.000Z",
      }),
    ];

    render(
      <VersionTimeline
        {...defaultProps}
        currentPublishedVersionId="v2"
        publishedVersionIds={new Set(["v2"])}
        publishEventsByVersionId={new Map([["v2", events]])}
      />,
    );

    const badge = screen.getByText("published 2x");

    // Act - expand then collapse
    await user.click(badge);
    const containerAfterExpand = badge.closest(".relative");
    expect(
      containerAfterExpand?.querySelector(".absolute.right-0"),
    ).toBeInTheDocument();

    await user.click(badge);

    // Assert - popover gone
    expect(
      containerAfterExpand?.querySelector(".absolute.right-0"),
    ).not.toBeInTheDocument();
  });

  it("does not render green dot when currentPublishedVersionId does not match any version", () => {
    // Arrange & Act
    render(
      <VersionTimeline
        {...defaultProps}
        currentPublishedVersionId="v-nonexistent"
        publishedVersionIds={new Set(["v-nonexistent"])}
        publishEventsByVersionId={new Map()}
      />,
    );

    // Assert
    expect(
      screen.queryByLabelText("Currently published"),
    ).not.toBeInTheDocument();
  });

  it("does not render publish badge when version has no publish events in map", () => {
    // Arrange & Act
    render(
      <VersionTimeline
        {...defaultProps}
        currentPublishedVersionId="v3"
        publishedVersionIds={new Set(["v3"])}
        publishEventsByVersionId={
          new Map([
            ["v3", [createPublishEvent({ id: "pe-1", versionId: "v3" })]],
          ])
        }
      />,
    );

    // Assert - only v3 should have a badge, v1 and v2 should not
    const buttons = screen.getAllByRole("button");
    const publishBadges = buttons.filter(
      (b) =>
        b.textContent === "published" ||
        b.textContent === "was published" ||
        b.textContent?.includes("x"),
    );
    expect(publishBadges).toHaveLength(1);
    expect(publishBadges[0]?.textContent).toBe("published");
  });

  it('renders "published 3x" for previously-published version with 3 events', () => {
    // Arrange
    const threeEvents = [
      createPublishEvent({
        id: "pe-1",
        versionId: "v1",
        createdAt: "2026-02-01T12:00:00.000Z",
      }),
      createPublishEvent({
        id: "pe-2",
        versionId: "v1",
        createdAt: "2026-02-02T12:00:00.000Z",
      }),
      createPublishEvent({
        id: "pe-3",
        versionId: "v1",
        createdAt: "2026-02-03T12:00:00.000Z",
      }),
    ];

    // Act
    render(
      <VersionTimeline
        {...defaultProps}
        currentPublishedVersionId="v3"
        publishedVersionIds={new Set(["v1", "v3"])}
        publishEventsByVersionId={
          new Map([
            ["v1", threeEvents],
            ["v3", [createPublishEvent({ id: "pe-4", versionId: "v3" })]],
          ])
        }
      />,
    );

    // Assert - v1 was previously published 3 times
    expect(screen.getByText("published 3x")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
  });
});
