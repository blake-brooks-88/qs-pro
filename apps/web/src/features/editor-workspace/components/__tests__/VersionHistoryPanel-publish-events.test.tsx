import type { PublishEventListItem, VersionListItem } from "@qpp/shared-types";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePublishEvents } from "@/features/editor-workspace/hooks/use-publish-events";
import {
  useQueryVersions,
  useRestoreVersion,
  useUpdateVersionName,
  useVersionDetail,
} from "@/features/editor-workspace/hooks/use-query-versions";
import { useFeature } from "@/hooks/use-feature";

import { VersionHistoryPanel } from "../VersionHistoryPanel";

vi.mock("@/features/editor-workspace/hooks/use-query-versions", () => ({
  useQueryVersions: vi.fn(),
  useVersionDetail: vi.fn(),
  useRestoreVersion: vi.fn(),
  useUpdateVersionName: vi.fn(),
}));

vi.mock("@/features/editor-workspace/hooks/use-publish-events", () => ({
  usePublishEvents: vi.fn(),
}));

vi.mock("@/hooks/use-feature", () => ({
  useFeature: vi.fn(),
}));

vi.mock("@/features/editor-workspace/components/VersionDiffViewer", () => ({
  VersionDiffViewer: () => <div data-testid="version-diff-viewer" />,
}));

vi.mock("@/components/ui/locked-overlay", () => ({
  LockedOverlay: ({
    locked,
    children,
  }: {
    locked: boolean;
    children: ReactNode;
  }) =>
    locked ? (
      <div data-testid="locked-overlay">{children}</div>
    ) : (
      <>{children}</>
    ),
}));

const mockUseFeature = vi.mocked(useFeature);
const mockUseQueryVersions = vi.mocked(useQueryVersions);
const mockUseVersionDetail = vi.mocked(useVersionDetail);
const mockUseRestoreVersion = vi.mocked(useRestoreVersion);
const mockUseUpdateVersionName = vi.mocked(useUpdateVersionName);
const mockUsePublishEvents = vi.mocked(usePublishEvents);

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

function threeVersions(): VersionListItem[] {
  return [
    createVersion({ id: "v1", createdAt: "2026-02-01T10:00:00.000Z" }),
    createVersion({ id: "v2", createdAt: "2026-02-03T10:00:00.000Z" }),
    createVersion({ id: "v3", createdAt: "2026-02-05T10:00:00.000Z" }),
  ];
}

function setupDefaultMocks(
  versions: VersionListItem[] = threeVersions(),
): void {
  mockUseFeature.mockReturnValue({ enabled: true, isLoading: false });

  mockUseQueryVersions.mockReturnValue({
    data: { versions, total: versions.length },
    isLoading: false,
  } as unknown as ReturnType<typeof useQueryVersions>);

  mockUseVersionDetail.mockReturnValue({
    data: { sqlText: "SELECT Id FROM Contact" },
  } as unknown as ReturnType<typeof useVersionDetail>);

  mockUseRestoreVersion.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useRestoreVersion>);

  mockUseUpdateVersionName.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateVersionName>);

  mockUsePublishEvents.mockReturnValue({
    data: undefined,
  } as unknown as ReturnType<typeof usePublishEvents>);
}

describe("VersionHistoryPanel - publish events and gap counter", () => {
  const baseProps = {
    savedQueryId: "sq-1",
    queryName: "Test Query",
    onClose: vi.fn(),
    onRestore: vi.fn(),
    onUpgradeClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('shows "2 versions ahead" when published version is oldest of 3', () => {
    // Arrange - publish event points to v1 (oldest), 2 versions after it
    mockUsePublishEvents.mockReturnValue({
      data: {
        events: [createPublishEvent({ id: "pe-1", versionId: "v1" })],
        total: 1,
      },
    } as unknown as ReturnType<typeof usePublishEvents>);

    // Act
    render(<VersionHistoryPanel {...baseProps} isLinked={true} />);

    // Assert
    expect(screen.getByText(/2\s+versions\s+ahead/)).toBeInTheDocument();
  });

  it('shows "1 version ahead" (singular) when one version after published', () => {
    // Arrange - publish event points to v2, only v3 ahead
    mockUsePublishEvents.mockReturnValue({
      data: {
        events: [createPublishEvent({ id: "pe-1", versionId: "v2" })],
        total: 1,
      },
    } as unknown as ReturnType<typeof usePublishEvents>);

    // Act
    render(<VersionHistoryPanel {...baseProps} isLinked={true} />);

    // Assert
    expect(screen.getByText(/1\s+version\s+ahead/)).toBeInTheDocument();
  });

  it("hides gap counter when latest version is published", () => {
    // Arrange - publish event points to v3 (latest)
    mockUsePublishEvents.mockReturnValue({
      data: {
        events: [createPublishEvent({ id: "pe-1", versionId: "v3" })],
        total: 1,
      },
    } as unknown as ReturnType<typeof usePublishEvents>);

    // Act
    render(<VersionHistoryPanel {...baseProps} isLinked={true} />);

    // Assert
    expect(screen.queryByText(/ahead/)).not.toBeInTheDocument();
  });

  it("hides gap counter when no published version exists", () => {
    // Arrange - no publish events
    mockUsePublishEvents.mockReturnValue({
      data: { events: [], total: 0 },
    } as unknown as ReturnType<typeof usePublishEvents>);

    // Act
    render(<VersionHistoryPanel {...baseProps} isLinked={true} />);

    // Assert
    expect(screen.queryByText(/ahead/)).not.toBeInTheDocument();
  });

  it("does not fetch publish events when isLinked is false", () => {
    // Arrange & Act
    render(<VersionHistoryPanel {...baseProps} isLinked={false} />);

    // Assert - usePublishEvents should be called with undefined
    expect(mockUsePublishEvents).toHaveBeenCalledWith(undefined);
    expect(screen.queryByText(/ahead/)).not.toBeInTheDocument();
  });

  it("does not fetch publish events when isLinked is not provided", () => {
    // Arrange & Act
    render(<VersionHistoryPanel {...baseProps} />);

    // Assert
    expect(mockUsePublishEvents).toHaveBeenCalledWith(undefined);
    expect(screen.queryByText(/ahead/)).not.toBeInTheDocument();
  });

  it("hides gap counter when isLinked but publish events data is undefined", () => {
    // Arrange - usePublishEvents returns undefined data (loading or no data)
    mockUsePublishEvents.mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof usePublishEvents>);

    // Act
    render(<VersionHistoryPanel {...baseProps} isLinked={true} />);

    // Assert
    expect(screen.queryByText(/ahead/)).not.toBeInTheDocument();
  });

  it("passes publish state props to VersionTimeline so indicators render", () => {
    // Arrange - publish event points to v2
    mockUsePublishEvents.mockReturnValue({
      data: {
        events: [createPublishEvent({ id: "pe-1", versionId: "v2" })],
        total: 1,
      },
    } as unknown as ReturnType<typeof usePublishEvents>);

    // Act
    render(<VersionHistoryPanel {...baseProps} isLinked={true} />);

    // Assert - VersionTimeline receives currentPublishedVersionId and renders indicator
    expect(screen.getByLabelText("Currently published")).toBeInTheDocument();
  });

  it("fetches publish events with savedQueryId when isLinked is true", () => {
    // Arrange & Act
    render(<VersionHistoryPanel {...baseProps} isLinked={true} />);

    // Assert
    expect(mockUsePublishEvents).toHaveBeenCalledWith("sq-1");
  });

  it("passes previously-published state to VersionTimeline for grey dots", () => {
    // Arrange - v1 was published first, then v3 became current
    mockUsePublishEvents.mockReturnValue({
      data: {
        events: [
          createPublishEvent({
            id: "pe-2",
            versionId: "v3",
            createdAt: "2026-02-06T12:00:00.000Z",
          }),
          createPublishEvent({
            id: "pe-1",
            versionId: "v1",
            createdAt: "2026-02-02T12:00:00.000Z",
          }),
        ],
        total: 2,
      },
    } as unknown as ReturnType<typeof usePublishEvents>);

    // Act
    render(<VersionHistoryPanel {...baseProps} isLinked={true} />);

    // Assert
    expect(screen.getByLabelText("Currently published")).toBeInTheDocument();
    expect(screen.getByLabelText("Previously published")).toBeInTheDocument();
  });
});
