import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Folder } from "@/features/editor-workspace/types";

import { FolderTree } from "../FolderTree";

describe("FolderTree", () => {
  const mockFolders: Folder[] = [
    {
      id: "root-1",
      name: "Root Folder A",
      parentId: null,
      type: "data-extension",
    },
    {
      id: "root-2",
      name: "Root Folder B",
      parentId: null,
      type: "data-extension",
    },
    {
      id: "child-1",
      name: "Child Folder",
      parentId: "root-1",
      type: "data-extension",
    },
    {
      id: "grandchild-1",
      name: "Grandchild Folder",
      parentId: "child-1",
      type: "data-extension",
    },
  ];

  const defaultProps = {
    folders: mockFolders,
    selectedId: null,
    onSelect: vi.fn(),
  };

  describe("rendering", () => {
    it("FolderTree_RootFolders_RendersCorrectly", () => {
      // Arrange & Act
      render(<FolderTree {...defaultProps} />);

      // Assert - Root folders should be visible
      expect(
        screen.getByRole("button", { name: "Root Folder A" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Root Folder B" }),
      ).toBeInTheDocument();
    });

    it("FolderTree_FoldersSortedAlphabetically", () => {
      // Arrange & Act
      render(<FolderTree {...defaultProps} />);

      // Assert - Folders should be sorted alphabetically
      const buttons = screen
        .getAllByRole("button")
        .filter(
          (btn) =>
            btn.textContent === "Root Folder A" ||
            btn.textContent === "Root Folder B",
        );
      expect(buttons[0]).toHaveTextContent("Root Folder A");
      expect(buttons[1]).toHaveTextContent("Root Folder B");
    });

    it("FolderTree_ChildFolders_HiddenByDefault", () => {
      // Arrange & Act
      render(<FolderTree {...defaultProps} />);

      // Assert - Child folders should not be visible initially
      expect(
        screen.queryByRole("button", { name: "Child Folder" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("expand/collapse", () => {
    it("FolderTree_ClickArrow_ExpandsChildren", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTree {...defaultProps} />);

      // Act - Click expand arrow on parent folder
      const expandButton = screen.getByRole("button", {
        name: /expand folder/i,
      });
      await user.click(expandButton);

      // Assert - Child folder should now be visible
      expect(
        screen.getByRole("button", { name: "Child Folder" }),
      ).toBeInTheDocument();
    });

    it("FolderTree_ClickArrowAgain_CollapsesChildren", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTree {...defaultProps} />);

      // Act - Expand then collapse
      const expandButton = screen.getByRole("button", {
        name: /expand folder/i,
      });
      await user.click(expandButton);
      expect(
        screen.getByRole("button", { name: "Child Folder" }),
      ).toBeInTheDocument();

      const collapseButton = screen.getByRole("button", {
        name: /collapse folder/i,
      });
      await user.click(collapseButton);

      // Assert - Child folder should be hidden again
      expect(
        screen.queryByRole("button", { name: "Child Folder" }),
      ).not.toBeInTheDocument();
    });

    it("FolderTree_ExpandArrow_HasAriaExpanded", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTree {...defaultProps} />);

      // Assert - Initial state
      const expandButton = screen.getByRole("button", {
        name: /expand folder/i,
      });
      expect(expandButton).toHaveAttribute("aria-expanded", "false");

      // Act - Expand
      await user.click(expandButton);

      // Assert - Expanded state
      const collapseButton = screen.getByRole("button", {
        name: /collapse folder/i,
      });
      expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    });

    it("FolderTree_NestedExpand_ShowsGrandchildren", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTree {...defaultProps} />);

      // Act - Expand root and then child
      const expandRootButton = screen.getByRole("button", {
        name: /expand folder/i,
      });
      await user.click(expandRootButton);

      // After expanding root, child's expand button becomes the first "expand" button
      // (root's button now says "collapse")
      const childExpandButton = screen.getByRole("button", {
        name: /expand folder/i,
      });
      await user.click(childExpandButton);

      // Assert - Grandchild should be visible
      expect(
        screen.getByRole("button", { name: "Grandchild Folder" }),
      ).toBeInTheDocument();
    });
  });

  describe("selection", () => {
    it("FolderTree_ClickRow_SelectsFolder", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<FolderTree {...defaultProps} onSelect={onSelect} />);

      // Act - Click folder row (not arrow)
      const folderButton = screen.getByRole("button", {
        name: "Root Folder A",
      });
      await user.click(folderButton);

      // Assert
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith("root-1");
    });

    it("FolderTree_ClickArrow_DoesNotSelectFolder", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<FolderTree {...defaultProps} onSelect={onSelect} />);

      // Act - Click expand arrow
      const expandButton = screen.getByRole("button", {
        name: /expand folder/i,
      });
      await user.click(expandButton);

      // Assert - onSelect should NOT be called
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("FolderTree_SelectedId_HighlightsFolder", () => {
      // Arrange & Act
      render(<FolderTree {...defaultProps} selectedId="root-1" />);

      // Assert - Selected folder should have highlight class
      const folderOption = screen.getByRole("option", { selected: true });
      expect(folderOption).toBeInTheDocument();

      const folderButton = within(folderOption).getByRole("button", {
        name: "Root Folder A",
      });
      expect(folderButton).toHaveClass("bg-primary/10");
    });
  });

  describe("initialExpandedIds", () => {
    it("FolderTree_InitialExpandedIds_PreExpandsFolders", () => {
      // Arrange & Act
      render(<FolderTree {...defaultProps} initialExpandedIds={["root-1"]} />);

      // Assert - Child folder should be visible immediately
      expect(
        screen.getByRole("button", { name: "Child Folder" }),
      ).toBeInTheDocument();
    });

    it("FolderTree_InitialExpandedIds_MultipleExpanded", () => {
      // Arrange & Act
      render(
        <FolderTree
          {...defaultProps}
          initialExpandedIds={["root-1", "child-1"]}
        />,
      );

      // Assert - Both child and grandchild should be visible
      expect(
        screen.getByRole("button", { name: "Child Folder" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Grandchild Folder" }),
      ).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("FolderTree_EmptyFolders_RendersNothing", () => {
      // Arrange & Act
      const { container } = render(
        <FolderTree {...defaultProps} folders={[]} />,
      );

      // Assert - Should render empty container
      expect(container.querySelector("button")).not.toBeInTheDocument();
    });
  });
});
