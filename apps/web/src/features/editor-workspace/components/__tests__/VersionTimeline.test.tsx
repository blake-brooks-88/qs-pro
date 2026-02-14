import type { VersionListItem } from "@qpp/shared-types";
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

describe("VersionTimeline", () => {
  const onSelectVersion = vi.fn();
  const onUpdateName = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "No versions yet" when versions array is empty', () => {
    render(
      <VersionTimeline
        versions={[]}
        selectedVersionId={null}
        onSelectVersion={onSelectVersion}
        onUpdateName={onUpdateName}
      />,
    );

    expect(screen.getByText("No versions yet")).toBeInTheDocument();
  });

  it("sorts versions newest-first by createdAt", () => {
    const versions = [
      createVersion({
        id: "v-old",
        createdAt: "2026-01-01T10:00:00.000Z",
        versionName: "Oldest",
      }),
      createVersion({
        id: "v-new",
        createdAt: "2026-01-03T10:00:00.000Z",
        versionName: "Newest",
      }),
      createVersion({
        id: "v-mid",
        createdAt: "2026-01-02T10:00:00.000Z",
        versionName: "Middle",
      }),
    ];

    render(
      <VersionTimeline
        versions={versions}
        selectedVersionId={null}
        onSelectVersion={onSelectVersion}
        onUpdateName={onUpdateName}
      />,
    );

    const newest = screen.getByText("Newest");
    const middle = screen.getByText("Middle");
    const oldest = screen.getByText("Oldest");

    // Verify DOM order: newest should appear before middle, middle before oldest
    expect(
      newest.compareDocumentPosition(middle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      middle.compareDocumentPosition(oldest) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("calls onSelectVersion when a version card is clicked", async () => {
    const user = userEvent.setup();
    const versions = [
      createVersion({
        id: "v-1",
        createdAt: "2026-01-01T10:00:00.000Z",
        versionName: "Click Me",
      }),
    ];

    render(
      <VersionTimeline
        versions={versions}
        selectedVersionId={null}
        onSelectVersion={onSelectVersion}
        onUpdateName={onUpdateName}
      />,
    );

    const cards = screen
      .getAllByRole("button")
      .filter(
        (btn) =>
          btn.tagName === "BUTTON" && btn.className.includes("rounded-lg"),
      );
    expect(cards).toHaveLength(1);
    await user.click(cards[0]);

    expect(onSelectVersion).toHaveBeenCalledWith("v-1");
  });

  it('renders "restored" badge when version source is restore', () => {
    const versions = [
      createVersion({
        id: "v-1",
        createdAt: "2026-01-01T10:00:00.000Z",
        source: "restore",
        restoredFromId: "v-0",
      }),
    ];

    render(
      <VersionTimeline
        versions={versions}
        selectedVersionId={null}
        onSelectVersion={onSelectVersion}
        onUpdateName={onUpdateName}
      />,
    );

    expect(screen.getByText("restored")).toBeInTheDocument();
  });

  it("renders positive line count delta with green styling", () => {
    const versions = [
      createVersion({
        id: "v-2",
        createdAt: "2026-01-02T10:00:00.000Z",
        lineCount: 15,
      }),
      createVersion({
        id: "v-1",
        createdAt: "2026-01-01T10:00:00.000Z",
        lineCount: 10,
      }),
    ];

    render(
      <VersionTimeline
        versions={versions}
        selectedVersionId={null}
        onSelectVersion={onSelectVersion}
        onUpdateName={onUpdateName}
      />,
    );

    const delta = screen.getByText("+5 lines");
    expect(delta).toBeInTheDocument();
    expect(delta.className).toContain("text-green-500");
  });

  it("renders negative line count delta with red styling", () => {
    const versions = [
      createVersion({
        id: "v-2",
        createdAt: "2026-01-02T10:00:00.000Z",
        lineCount: 7,
      }),
      createVersion({
        id: "v-1",
        createdAt: "2026-01-01T10:00:00.000Z",
        lineCount: 10,
      }),
    ];

    render(
      <VersionTimeline
        versions={versions}
        selectedVersionId={null}
        onSelectVersion={onSelectVersion}
        onUpdateName={onUpdateName}
      />,
    );

    const delta = screen.getByText("-3 lines");
    expect(delta).toBeInTheDocument();
    expect(delta.className).toContain("text-red-500");
  });

  it("does not render line count delta for the oldest version", () => {
    const versions = [
      createVersion({
        id: "v-2",
        createdAt: "2026-01-02T10:00:00.000Z",
        lineCount: 15,
      }),
      createVersion({
        id: "v-1",
        createdAt: "2026-01-01T10:00:00.000Z",
        lineCount: 10,
      }),
    ];

    render(
      <VersionTimeline
        versions={versions}
        selectedVersionId={null}
        onSelectVersion={onSelectVersion}
        onUpdateName={onUpdateName}
      />,
    );

    const deltaElements = screen.queryAllByText(/lines$/);
    expect(deltaElements).toHaveLength(1);
    expect(deltaElements[0]).toHaveTextContent("+5 lines");
  });

  it("renders author name when provided", () => {
    const versions = [
      createVersion({
        id: "v-1",
        createdAt: "2026-01-01T10:00:00.000Z",
        authorName: "Alice",
      }),
    ];

    render(
      <VersionTimeline
        versions={versions}
        selectedVersionId={null}
        onSelectVersion={onSelectVersion}
        onUpdateName={onUpdateName}
      />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("does not render author section when authorName is null", () => {
    const versions = [
      createVersion({
        id: "v-1",
        createdAt: "2026-01-01T10:00:00.000Z",
        authorName: null,
      }),
    ];

    render(
      <VersionTimeline
        versions={versions}
        selectedVersionId={null}
        onSelectVersion={onSelectVersion}
        onUpdateName={onUpdateName}
      />,
    );

    const svgs = document.querySelectorAll("svg");
    expect(svgs).toHaveLength(0);
  });

  describe("InlineEditableName", () => {
    it("enters edit mode on click and saves on Enter", async () => {
      const user = userEvent.setup();
      const versions = [
        createVersion({
          id: "v-1",
          createdAt: "2026-01-01T10:00:00.000Z",
          versionName: "Original Name",
        }),
      ];

      render(
        <VersionTimeline
          versions={versions}
          selectedVersionId={null}
          onSelectVersion={onSelectVersion}
          onUpdateName={onUpdateName}
        />,
      );

      const nameButton = screen.getByText("Original Name");
      await user.click(nameButton);

      const input = screen.getByRole("textbox", { name: "Version name" });
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("Original Name");

      await user.clear(input);
      await user.type(input, "New Name{Enter}");

      expect(onUpdateName).toHaveBeenCalledWith("v-1", "New Name");
    });

    it("cancels edit on Escape without calling onUpdateName", async () => {
      const user = userEvent.setup();
      const versions = [
        createVersion({
          id: "v-1",
          createdAt: "2026-01-01T10:00:00.000Z",
          versionName: "Keep This",
        }),
      ];

      render(
        <VersionTimeline
          versions={versions}
          selectedVersionId={null}
          onSelectVersion={onSelectVersion}
          onUpdateName={onUpdateName}
        />,
      );

      await user.click(screen.getByText("Keep This"));
      const input = screen.getByRole("textbox", { name: "Version name" });
      await user.clear(input);
      await user.type(input, "Discarded");
      await user.keyboard("{Escape}");

      expect(onUpdateName).not.toHaveBeenCalled();
      expect(screen.getByText("Keep This")).toBeInTheDocument();
    });

    it("saves null when name is cleared to empty", async () => {
      const user = userEvent.setup();
      const versions = [
        createVersion({
          id: "v-1",
          createdAt: "2026-01-01T10:00:00.000Z",
          versionName: "Remove Me",
        }),
      ];

      render(
        <VersionTimeline
          versions={versions}
          selectedVersionId={null}
          onSelectVersion={onSelectVersion}
          onUpdateName={onUpdateName}
        />,
      );

      await user.click(screen.getByText("Remove Me"));
      const input = screen.getByRole("textbox", { name: "Version name" });
      await user.clear(input);
      await user.keyboard("{Enter}");

      expect(onUpdateName).toHaveBeenCalledWith("v-1", null);
    });

    it("shows default timestamp display for unnamed version and enters edit on click", async () => {
      const user = userEvent.setup();
      const versions = [
        createVersion({
          id: "v-1",
          createdAt: "2026-01-15T14:30:00.000Z",
          versionName: null,
        }),
      ];

      render(
        <VersionTimeline
          versions={versions}
          selectedVersionId={null}
          onSelectVersion={onSelectVersion}
          onUpdateName={onUpdateName}
        />,
      );

      const timestampButtons = screen
        .getAllByRole("button")
        .filter(
          (el) =>
            el.className.includes("text-muted-foreground") &&
            el.className.includes("cursor-text"),
        );
      expect(timestampButtons).toHaveLength(1);

      await user.click(timestampButtons[0]);

      const input = screen.getByRole("textbox", { name: "Version name" });
      expect(input).toBeInTheDocument();
    });
  });
});
