import type { VersionListItem } from "@qpp/shared-types";
import { render, screen } from "@testing-library/react";
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

vi.mock("@/features/editor-workspace/hooks/use-query-versions", () => ({
  useQueryVersions: vi.fn(),
  useVersionDetail: vi.fn(),
  useRestoreVersion: vi.fn(),
  useUpdateVersionName: vi.fn(),
}));

vi.mock("@/features/editor-workspace/hooks/use-publish-events", () => ({
  usePublishEvents: vi.fn().mockReturnValue({ data: undefined }),
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

function setupDefaultMocks() {
  mockUseFeature.mockReturnValue({ enabled: true, isLoading: false });

  mockUseQueryVersions.mockReturnValue({
    data: { versions: createMockVersions(), total: 2 },
    isLoading: false,
  } as unknown as ReturnType<typeof useQueryVersions>);

  mockUseVersionDetail.mockReturnValue({
    data: { sqlText: "SELECT Id FROM Subscribers" },
  } as unknown as ReturnType<typeof useVersionDetail>);

  mockUseRestoreVersion.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useRestoreVersion>);

  mockUseUpdateVersionName.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateVersionName>);
}

describe("VersionHistoryPanel — publish button", () => {
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

  it("shows Publish button when isLinked=true and onPublishVersion is provided", () => {
    const onPublishVersion = vi.fn();

    render(
      <VersionHistoryPanel
        {...baseProps}
        isLinked={true}
        onPublishVersion={onPublishVersion}
      />,
    );

    expect(
      screen.getByRole("button", { name: /publish/i }),
    ).toBeInTheDocument();
  });

  it("does NOT show Publish button when isLinked=false", () => {
    render(
      <VersionHistoryPanel
        {...baseProps}
        isLinked={false}
        onPublishVersion={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /publish/i }),
    ).not.toBeInTheDocument();
  });

  it("does NOT show Publish button when onPublishVersion is not provided", () => {
    render(<VersionHistoryPanel {...baseProps} isLinked={true} />);

    expect(
      screen.queryByRole("button", { name: /publish/i }),
    ).not.toBeInTheDocument();
  });

  it("does NOT show Publish button when isLinked is undefined", () => {
    render(<VersionHistoryPanel {...baseProps} onPublishVersion={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: /publish/i }),
    ).not.toBeInTheDocument();
  });

  it("calls onPublishVersion with the selected version ID when clicked", async () => {
    const user = userEvent.setup();
    const onPublishVersion = vi.fn();

    render(
      <VersionHistoryPanel
        {...baseProps}
        isLinked={true}
        onPublishVersion={onPublishVersion}
      />,
    );

    const publishButton = screen.getByRole("button", { name: /publish/i });
    await user.click(publishButton);

    // The panel auto-selects the latest version (v2, sorted by createdAt desc)
    expect(onPublishVersion).toHaveBeenCalledTimes(1);
    expect(onPublishVersion).toHaveBeenCalledWith("v2");
  });

  it("does NOT show Publish button when versionHistory feature is disabled", () => {
    mockUseFeature.mockReturnValue({ enabled: false, isLoading: false });

    render(
      <VersionHistoryPanel
        {...baseProps}
        isLinked={true}
        onPublishVersion={vi.fn()}
      />,
    );

    // When feature is disabled, the component renders a LockedOverlay
    // and passes undefined to useQueryVersions — no versions load, no buttons render
    expect(screen.getByTestId("locked-overlay")).toBeInTheDocument();
  });

  it("renders version timeline alongside the publish button", () => {
    render(
      <VersionHistoryPanel
        {...baseProps}
        isLinked={true}
        onPublishVersion={vi.fn()}
      />,
    );

    // Publish button present
    expect(
      screen.getByRole("button", { name: /publish/i }),
    ).toBeInTheDocument();

    // Restore button also present (existing functionality preserved)
    expect(
      screen.getByRole("button", { name: /restore this version/i }),
    ).toBeInTheDocument();

    // Version timeline entries present
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
  });

  it("shows version history header text when publish props are provided", () => {
    render(
      <VersionHistoryPanel
        {...baseProps}
        isLinked={true}
        onPublishVersion={vi.fn()}
      />,
    );

    expect(screen.getByText("Test Query")).toBeInTheDocument();
    expect(screen.getByText("Version History")).toBeInTheDocument();
  });
});
