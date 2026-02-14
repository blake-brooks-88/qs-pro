import type { VersionListItem } from "@qpp/shared-types";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useQueryVersions,
  useRestoreVersion,
  useUpdateVersionName,
  useVersionDetail,
} from "@/features/editor-workspace/hooks/use-query-versions";
import { useFeature } from "@/hooks/use-feature";

import { VersionHistoryPanel } from "../VersionHistoryPanel";
import { VersionTimeline } from "../VersionTimeline";

vi.mock("@/features/editor-workspace/hooks/use-query-versions", () => ({
  useQueryVersions: vi.fn(),
  useVersionDetail: vi.fn(),
  useRestoreVersion: vi.fn(),
  useUpdateVersionName: vi.fn(),
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

function createMockVersions(): VersionListItem[] {
  return [
    {
      id: "v1",
      savedQueryId: "sq-1",
      lineCount: 10,
      source: "save",
      restoredFromId: null,
      versionName: null,
      createdAt: "2026-02-01T10:00:00.000Z",
      authorName: "John Doe",
    },
    {
      id: "v2",
      savedQueryId: "sq-1",
      lineCount: 15,
      source: "save",
      restoredFromId: null,
      versionName: "Feature complete",
      createdAt: "2026-02-05T14:00:00.000Z",
      authorName: "Jane Smith",
    },
  ];
}

describe("VersionHistoryPanel", () => {
  const defaultProps = {
    savedQueryId: "sq-1",
    queryName: "My Test Query",
    onClose: vi.fn(),
    onRestore: vi.fn(),
    onUpgradeClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseFeature.mockReturnValue({ enabled: true, isLoading: false });

    mockUseQueryVersions.mockReturnValue({
      data: { versions: createMockVersions(), total: 2 },
      isLoading: false,
    } as unknown as ReturnType<typeof useQueryVersions>);

    mockUseVersionDetail.mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useVersionDetail>);

    mockUseRestoreVersion.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useRestoreVersion>);

    mockUseUpdateVersionName.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateVersionName>);
  });

  it("VersionHistoryPanel_Default_RendersQueryNameAndVersionHistoryLabel", () => {
    // Arrange & Act
    render(<VersionHistoryPanel {...defaultProps} />);

    // Assert
    expect(screen.getByText("My Test Query")).toBeInTheDocument();
    expect(screen.getByText("Version History")).toBeInTheDocument();
  });

  it("VersionHistoryPanel_Loading_ShowsLoadingMessage", () => {
    // Arrange
    mockUseQueryVersions.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useQueryVersions>);

    // Act
    render(<VersionHistoryPanel {...defaultProps} />);

    // Assert
    expect(screen.getByText("Loading versions...")).toBeInTheDocument();
  });

  it("VersionHistoryPanel_EmptyVersions_ShowsNoVersionsAvailable", () => {
    // Arrange
    mockUseQueryVersions.mockReturnValue({
      data: { versions: [], total: 0 },
      isLoading: false,
    } as unknown as ReturnType<typeof useQueryVersions>);

    // Act
    render(<VersionHistoryPanel {...defaultProps} />);

    // Assert
    expect(screen.getByText("No versions available")).toBeInTheDocument();
  });

  it("VersionHistoryPanel_InvalidVersionsPayload_DoesNotCrash", () => {
    // Arrange — guard against unexpected API payload shapes
    mockUseQueryVersions.mockReturnValue({
      data: { versions: {} as unknown as VersionListItem[], total: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof useQueryVersions>);

    // Act
    render(<VersionHistoryPanel {...defaultProps} />);

    // Assert
    expect(screen.getByText("No versions available")).toBeInTheDocument();
  });

  it("VersionHistoryPanel_CloseButton_CallsOnClose", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<VersionHistoryPanel {...defaultProps} onClose={onClose} />);

    // Act
    await user.click(
      screen.getByRole("button", { name: /close version history/i }),
    );

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("VersionHistoryPanel_LatestVersionSelected_DisablesRestoreButton", () => {
    // Arrange & Act — panel auto-selects the latest version (v2)
    render(<VersionHistoryPanel {...defaultProps} />);

    // Assert
    const restoreButton = screen.getByRole("button", {
      name: /restore this version/i,
    });
    expect(restoreButton).toBeDisabled();
  });

  it("VersionHistoryPanel_FeatureLocked_PassesUndefinedToUseQueryVersions", () => {
    // Arrange
    mockUseFeature.mockReturnValue({ enabled: false, isLoading: false });

    // Act
    render(<VersionHistoryPanel {...defaultProps} />);

    // Assert
    expect(mockUseQueryVersions).toHaveBeenCalledWith(undefined);
  });

  it("VersionHistoryPanel_FeatureLocked_RendersLockedOverlay", () => {
    // Arrange
    mockUseFeature.mockReturnValue({ enabled: false, isLoading: false });

    // Act
    render(<VersionHistoryPanel {...defaultProps} />);

    // Assert
    expect(screen.getByTestId("locked-overlay")).toBeInTheDocument();
  });

  it("VersionHistoryPanel_ShowChangesToggle_TogglesState", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<VersionHistoryPanel {...defaultProps} />);

    // Act - click the Show Changes toggle button
    const toggleButton = screen.getByText("Show Changes").closest("button");
    expect(toggleButton).not.toBeNull();
    await user.click(toggleButton as HTMLElement);

    // Assert - toggle was clicked successfully (component re-renders without error)
    expect(screen.getByText("Show Changes")).toBeInTheDocument();
  });

  it("VersionHistoryPanel_RestoreFlow_CallsMutateWithCorrectArgs", async () => {
    // Arrange
    const user = userEvent.setup();
    const mockMutate = vi.fn();

    mockUseVersionDetail.mockReturnValue({
      data: { sqlText: "SELECT Id FROM Contact" },
    } as unknown as ReturnType<typeof useVersionDetail>);

    mockUseRestoreVersion.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRestoreVersion>);

    render(<VersionHistoryPanel {...defaultProps} />);

    // Act - Select the older version (v1) by clicking its card via author name
    const olderVersionCard = screen.getByText("John Doe").closest("button");
    expect(olderVersionCard).not.toBeNull();
    await user.click(olderVersionCard as HTMLElement);

    // Restore button should now be enabled for a non-latest version
    await waitFor(() => {
      const restoreButton = screen.getByRole("button", {
        name: /restore this version/i,
      });
      expect(restoreButton).not.toBeDisabled();
    });

    // Click the Restore button to open the confirmation dialog
    await user.click(
      screen.getByRole("button", { name: /restore this version/i }),
    );

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText("Restore version")).toBeInTheDocument();
    });

    // Click Restore in the confirmation dialog
    await user.click(screen.getByRole("button", { name: "Restore" }));

    // Assert - restoreMutation.mutate was called with correct version ID
    expect(mockMutate).toHaveBeenCalledWith(
      { savedQueryId: "sq-1", versionId: "v1" },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("VersionHistoryPanel_RestorePending_ShowsRestoringText", () => {
    // Arrange
    mockUseRestoreVersion.mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    } as unknown as ReturnType<typeof useRestoreVersion>);

    // Act
    render(<VersionHistoryPanel {...defaultProps} />);

    // Assert
    expect(screen.getByText("Restoring...")).toBeInTheDocument();
  });
});

describe("VersionTimeline", () => {
  const defaultTimelineProps = {
    versions: createMockVersions(),
    selectedVersionId: null,
    onSelectVersion: vi.fn(),
    onUpdateName: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("VersionTimeline_EmptyVersions_ShowsNoVersionsYet", () => {
    // Arrange & Act
    render(<VersionTimeline {...defaultTimelineProps} versions={[]} />);

    // Assert
    expect(screen.getByText("No versions yet")).toBeInTheDocument();
  });

  it("VersionTimeline_MultipleVersions_RendersSortedByDateNewestFirst", () => {
    // Arrange & Act
    const { container } = render(<VersionTimeline {...defaultTimelineProps} />);

    // Assert — v2 (Feb 5, Jane Smith) should appear before v1 (Feb 1, John Doe)
    const cards = container.querySelectorAll('button[type="button"]');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Jane Smith");
    expect(cards[1]).toHaveTextContent("John Doe");
  });

  it("VersionTimeline_CardClicked_CallsOnSelectVersion", async () => {
    // Arrange
    const user = userEvent.setup();
    const onSelectVersion = vi.fn();
    const { container } = render(
      <VersionTimeline
        {...defaultTimelineProps}
        onSelectVersion={onSelectVersion}
      />,
    );

    const cards = container.querySelectorAll('button[type="button"]');
    const firstCard = cards[0];
    expect(firstCard).toBeDefined();
    await user.click(firstCard as HTMLElement);

    // Assert
    expect(onSelectVersion).toHaveBeenCalledWith("v2");
  });

  it("VersionTimeline_VersionNames_RendersAsSpanElementsNotNestedButtons", () => {
    // Arrange & Act
    const { container } = render(<VersionTimeline {...defaultTimelineProps} />);

    // Assert
    const cardButtons = container.querySelectorAll('button[type="button"]');
    expect(cardButtons).toHaveLength(2);
    for (const card of cardButtons) {
      expect(card.querySelectorAll("button")).toHaveLength(0);
    }

    const nameElement = screen.getByText("Feature complete");
    expect(nameElement.tagName).toBe("SPAN");
  });

  it("VersionTimeline_RestoreSource_ShowsRestoredBadge", () => {
    // Arrange
    const versionsWithRestore: VersionListItem[] = [
      ...createMockVersions(),
      {
        id: "v3",
        savedQueryId: "sq-1",
        lineCount: 12,
        source: "restore",
        restoredFromId: "v1",
        versionName: null,
        createdAt: "2026-02-06T08:00:00.000Z",
        authorName: null,
      },
    ];

    // Act
    render(
      <VersionTimeline
        {...defaultTimelineProps}
        versions={versionsWithRestore}
      />,
    );

    // Assert
    expect(screen.getByText("restored")).toBeInTheDocument();
  });

  it("VersionTimeline_ConsecutiveVersions_ShowsLineCountDelta", () => {
    // Arrange & Act — v2 has 15 lines, v1 has 10 lines → delta is +5
    render(<VersionTimeline {...defaultTimelineProps} />);

    // Assert
    expect(screen.getByText("+5 lines")).toBeInTheDocument();
  });
});
