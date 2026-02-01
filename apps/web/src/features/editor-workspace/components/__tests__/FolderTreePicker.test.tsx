import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Folder } from "@/features/editor-workspace/types";

import { FolderTreePicker } from "../FolderTreePicker";

describe("FolderTreePicker", () => {
  const mockFolders: Folder[] = [
    {
      id: "root-1",
      name: "Root Folder",
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
      name: "Grandchild",
      parentId: "child-1",
      type: "data-extension",
    },
  ];

  const defaultProps = {
    folders: mockFolders,
    value: "",
    onChange: vi.fn(),
  };

  describe("collapsed state", () => {
    it("FolderTreePicker_NoValue_ShowsPlaceholder", () => {
      // Arrange & Act
      render(
        <FolderTreePicker {...defaultProps} placeholder="Select folder..." />,
      );

      // Assert
      expect(screen.getByText("Select folder...")).toBeInTheDocument();
    });

    it("FolderTreePicker_WithValue_ShowsBreadcrumb", () => {
      // Arrange & Act
      render(<FolderTreePicker {...defaultProps} value="child-1" />);

      // Assert - Should show full breadcrumb path
      expect(
        screen.getByText("Root Folder > Child Folder"),
      ).toBeInTheDocument();
    });

    it("FolderTreePicker_NestedValue_ShowsFullPath", () => {
      // Arrange & Act
      render(<FolderTreePicker {...defaultProps} value="grandchild-1" />);

      // Assert - Should show complete ancestor chain
      expect(
        screen.getByText("Root Folder > Child Folder > Grandchild"),
      ).toBeInTheDocument();
    });
  });

  describe("expand/collapse", () => {
    it("FolderTreePicker_ClickTrigger_ExpandsPicker", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTreePicker {...defaultProps} />);

      // Assert - Listbox not visible initially
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

      // Act
      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      // Assert - Listbox should now be visible
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("FolderTreePicker_ClickTriggerAgain_CollapsesPicker", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTreePicker {...defaultProps} />);

      // Act - Open then close
      const trigger = screen.getByRole("combobox");
      await user.click(trigger);
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      await user.click(trigger);

      // Assert - Listbox should be hidden (wait for exit animation)
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });
  });

  describe("selection", () => {
    it("FolderTreePicker_SelectFolder_UpdatesValueAndCollapses", async () => {
      // Arrange
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<FolderTreePicker {...defaultProps} onChange={onChange} />);

      // Act - Open and select folder
      const trigger = screen.getByRole("combobox");
      await user.click(trigger);
      const folderButton = screen.getByRole("button", { name: "Root Folder" });
      await user.click(folderButton);

      // Assert
      expect(onChange).toHaveBeenCalledWith("root-1");
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("FolderTreePicker_SelectNestedFolder_UpdatesValue", async () => {
      // Arrange
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<FolderTreePicker {...defaultProps} onChange={onChange} />);

      // Act - Open, expand parent, select child
      const trigger = screen.getByRole("combobox");
      await user.click(trigger);
      const expandButton = screen.getByRole("button", {
        name: /expand folder/i,
      });
      await user.click(expandButton);
      const childButton = screen.getByRole("button", { name: "Child Folder" });
      await user.click(childButton);

      // Assert
      expect(onChange).toHaveBeenCalledWith("child-1");
    });
  });

  describe("auto-expand ancestors", () => {
    it("FolderTreePicker_OpenWithValue_AutoExpandsAncestors", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTreePicker {...defaultProps} value="grandchild-1" />);

      // Act - Open picker
      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      // Assert - All ancestors should be expanded, grandchild visible
      const listbox = screen.getByRole("listbox");
      expect(
        within(listbox).getByRole("button", { name: "Grandchild" }),
      ).toBeInTheDocument();
    });

    it("FolderTreePicker_OpenWithChildValue_ShowsChild", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTreePicker {...defaultProps} value="child-1" />);

      // Act
      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      // Assert - Parent should be expanded, child visible
      const listbox = screen.getByRole("listbox");
      expect(
        within(listbox).getByRole("button", { name: "Child Folder" }),
      ).toBeInTheDocument();
    });
  });

  describe("keyboard", () => {
    it("FolderTreePicker_EscapeKey_ClosesPicker", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTreePicker {...defaultProps} />);

      // Act - Open picker
      const trigger = screen.getByRole("combobox");
      await user.click(trigger);
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      // Act - Press Escape
      await user.keyboard("{Escape}");

      // Assert - Picker should close (wait for exit animation)
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });
  });

  describe("click outside", () => {
    it("FolderTreePicker_ClickOutside_ClosesPicker", async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <div>
          <FolderTreePicker {...defaultProps} />
          <button type="button">Outside Button</button>
        </div>,
      );

      // Act - Open picker
      const trigger = screen.getByRole("combobox");
      await user.click(trigger);
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      // Act - Click outside
      const outsideButton = screen.getByRole("button", {
        name: "Outside Button",
      });
      await user.click(outsideButton);

      // Assert - Picker should close (wait for exit animation)
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });
  });

  describe("accessibility", () => {
    it("FolderTreePicker_Accessibility_HasCorrectTriggerAttributes", () => {
      // Arrange & Act
      render(<FolderTreePicker {...defaultProps} id="test-picker" />);

      // Assert
      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveAttribute("id", "test-picker");
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
      expect(trigger).toHaveAttribute("aria-controls", "test-picker-listbox");
    });

    it("FolderTreePicker_Accessibility_ExpandedStateUpdates", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTreePicker {...defaultProps} id="test-picker" />);

      // Assert initial
      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      // Act
      await user.click(trigger);

      // Assert expanded
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    it("FolderTreePicker_Accessibility_ListboxHasCorrectAttributes", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTreePicker {...defaultProps} id="test-picker" />);

      // Act
      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      // Assert
      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveAttribute("id", "test-picker-listbox");
      expect(listbox).toHaveAttribute("aria-label", "Folder selection");
    });
  });

  describe("empty state", () => {
    it("FolderTreePicker_EmptyFolders_ShowsEmptyMessage", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FolderTreePicker {...defaultProps} folders={[]} />);

      // Act
      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      // Assert
      expect(screen.getByText("No folders available")).toBeInTheDocument();
    });
  });
});
