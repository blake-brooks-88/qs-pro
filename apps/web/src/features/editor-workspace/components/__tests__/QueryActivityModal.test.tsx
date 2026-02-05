import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useDataExtensionDetails } from "@/features/editor-workspace/hooks/use-data-extension-details";
import type { DataExtension, Folder } from "@/features/editor-workspace/types";

import { QueryActivityModal } from "../QueryActivityModal";

// Mock the useDataExtensionDetails hook
vi.mock("@/features/editor-workspace/hooks/use-data-extension-details", () => ({
  useDataExtensionDetails: vi.fn(() => ({
    data: { hasPrimaryKey: true, fieldCount: 5, fields: [] },
    isLoading: false,
    error: null,
  })),
}));

const mockUseDataExtensionDetails = vi.mocked(useDataExtensionDetails);

function createMockDataExtensions(): DataExtension[] {
  return [
    {
      id: "de-1",
      name: "Subscribers",
      customerKey: "subscribers_key",
      folderId: "f1",
      description: "Subscriber data",
      fields: [],
      isShared: false,
    },
    {
      id: "de-2",
      name: "Products",
      customerKey: "products_key",
      folderId: "f1",
      description: "Product catalog",
      fields: [],
      isShared: false,
    },
    {
      id: "de-3",
      name: "Orders",
      customerKey: "orders_key",
      folderId: "f1",
      description: "Order history",
      fields: [],
      isShared: false,
    },
  ];
}

function createMockFolders(): Folder[] {
  return [
    {
      id: "100",
      name: "Query Activities",
      parentId: null,
      type: "library",
    },
    {
      id: "101",
      name: "Subfolder",
      parentId: "100",
      type: "library",
    },
  ];
}

describe("QueryActivityModal", () => {
  const defaultProps = {
    isOpen: true,
    dataExtensions: createMockDataExtensions(),
    folders: createMockFolders(),
    queryText: "SELECT * FROM Test",
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
  };

  describe("search filtering", () => {
    it("QueryActivityModal_SearchWithTerm_FiltersActivityList", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<QueryActivityModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act
      await user.click(searchInput);
      await user.type(searchInput, "Sub");

      // Assert - Only "Subscribers" should be visible in dropdown
      expect(screen.getByText("Subscribers")).toBeInTheDocument();
      expect(screen.queryByText("Products")).not.toBeInTheDocument();
      expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    });

    it("QueryActivityModal_SearchCleared_ShowsAllItemsOnFocus", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<QueryActivityModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act - Type then clear
      await user.click(searchInput);
      await user.type(searchInput, "Sub");
      await user.clear(searchInput);

      // Assert - All items should be visible when search is empty and focused
      expect(screen.getByText("Subscribers")).toBeInTheDocument();
      expect(screen.getByText("Products")).toBeInTheDocument();
      expect(screen.getByText("Orders")).toBeInTheDocument();
    });

    it("QueryActivityModal_NoMatchingSearch_ShowsNoResultsMessage", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<QueryActivityModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act
      await user.click(searchInput);
      await user.type(searchInput, "xyz123nonexistent");

      // Assert
      expect(
        screen.getByText(/no matching data extensions found/i),
      ).toBeInTheDocument();
    });
  });

  describe("target selection", () => {
    it("QueryActivityModal_TargetClicked_SelectsTarget", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<QueryActivityModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act - Focus search to show dropdown, then click a target
      await user.click(searchInput);
      await user.click(screen.getByRole("option", { name: /subscribers/i }));

      // Assert - Selected target card should be visible
      // The search input should be replaced with the selected target display
      expect(
        screen.queryByPlaceholderText(/search by name or customer key/i),
      ).not.toBeInTheDocument();
      // The selected target name should be visible in the selection card
      expect(screen.getByText("Subscribers")).toBeInTheDocument();
      expect(screen.getByText("subscribers_key")).toBeInTheDocument();
    });

    it("QueryActivityModal_TargetSelected_DisplaysSelectedTargetCard", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<QueryActivityModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act - Select a target
      await user.click(searchInput);
      await user.click(screen.getByRole("option", { name: /products/i }));

      // Assert - Verify the selected target card structure
      expect(screen.getByText("Products")).toBeInTheDocument();
      expect(screen.getByText("products_key")).toBeInTheDocument();
      // A clear/remove button should be available to deselect
      const clearButtons = screen.getAllByRole("button");
      const closeButton = clearButtons.find(
        (btn) =>
          btn.querySelector("svg") && !btn.textContent?.includes("Deploy"),
      );
      expect(closeButton).toBeDefined();
    });
  });

  describe("form validation and submit", () => {
    it("QueryActivityModal_NoTargetSelected_DisablesDeployButton", () => {
      // Arrange
      render(<QueryActivityModal {...defaultProps} />);

      // Assert - Deploy button should be disabled when no target is selected
      const deployButton = screen.getByRole("button", {
        name: /deploy activity/i,
      });
      expect(deployButton).toBeDisabled();
    });

    it("QueryActivityModal_TargetSelectedAndNameFilled_WithoutFolder_CallsOnSubmitWithUndefinedCategoryId", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<QueryActivityModal {...defaultProps} onSubmit={onSubmit} />);

      // Act - Fill activity name
      const activityNameInput = screen.getByLabelText(/activity name/i);
      await user.type(activityNameInput, "My Query Activity");

      // Act - Select target (no folder selected - folder is optional)
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      await user.click(screen.getByRole("option", { name: /subscribers/i }));

      // Act - Click deploy
      const deployButton = screen.getByRole("button", {
        name: /deploy activity/i,
      });
      expect(deployButton).not.toBeDisabled();
      await user.click(deployButton);

      // Assert - categoryId should be undefined when no folder selected
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My Query Activity",
          targetDataExtensionCustomerKey: "subscribers_key",
          categoryId: undefined,
          queryText: "SELECT * FROM Test",
          targetUpdateType: "Overwrite",
        }),
      );
    });

    it("QueryActivityModal_TargetSelectedAndNameFilled_WithFolder_CallsOnSubmitWithCategoryId", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<QueryActivityModal {...defaultProps} onSubmit={onSubmit} />);

      // Act - Fill activity name
      const activityNameInput = screen.getByLabelText(/activity name/i);
      await user.type(activityNameInput, "My Query Activity");

      // Act - Select folder
      const folderPicker = screen.getByRole("combobox", {
        name: /query activity folder/i,
      });
      await user.click(folderPicker);
      // Click the folder button inside the tree (the text is in the button, not the option wrapper)
      const folderButton = screen.getByRole("button", {
        name: /query activities/i,
      });
      await user.click(folderButton);

      // Act - Select target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      await user.click(screen.getByRole("option", { name: /subscribers/i }));

      // Act - Click deploy
      const deployButton = screen.getByRole("button", {
        name: /deploy activity/i,
      });
      await user.click(deployButton);

      // Assert - categoryId should be the selected folder ID
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My Query Activity",
          targetDataExtensionCustomerKey: "subscribers_key",
          categoryId: 100,
          queryText: "SELECT * FROM Test",
          targetUpdateType: "Overwrite",
        }),
      );
    });
  });

  describe("keyboard navigation", () => {
    it("QueryActivityModal_ArrowDown_MovesHighlightToNextItem", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<QueryActivityModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act - Focus search to show dropdown, then press ArrowDown
      await user.click(searchInput);
      await user.keyboard("{ArrowDown}");

      // Assert - First item should be highlighted
      const firstOption = screen.getByRole("option", { name: /subscribers/i });
      expect(firstOption).toHaveAttribute("aria-selected", "true");

      // Act - Press ArrowDown again
      await user.keyboard("{ArrowDown}");

      // Assert - Second item should be highlighted
      const secondOption = screen.getByRole("option", { name: /products/i });
      expect(secondOption).toHaveAttribute("aria-selected", "true");
      expect(firstOption).toHaveAttribute("aria-selected", "false");
    });

    it("QueryActivityModal_ArrowUp_MovesHighlightToPreviousItem", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<QueryActivityModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act - Focus search, move down twice, then up once
      await user.click(searchInput);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowUp}");

      // Assert - First item should be highlighted again
      const firstOption = screen.getByRole("option", { name: /subscribers/i });
      expect(firstOption).toHaveAttribute("aria-selected", "true");
    });

    it("QueryActivityModal_Enter_SelectsHighlightedItem", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<QueryActivityModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act - Focus search, navigate to second item, press Enter
      await user.click(searchInput);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      // Assert - Products should be selected (dropdown closed, card shown)
      expect(
        screen.queryByPlaceholderText(/search by name or customer key/i),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Products")).toBeInTheDocument();
      expect(screen.getByText("products_key")).toBeInTheDocument();
    });

    it("QueryActivityModal_Escape_ClosesDropdown", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<QueryActivityModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act - Focus search to show dropdown
      await user.click(searchInput);

      // Assert - Dropdown should be visible
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      // Act - Press Escape
      await user.keyboard("{Escape}");

      // Assert - Dropdown should be closed
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("Update mode PK validation", () => {
    it("QueryActivityModal_UpdateModeNoPrimaryKey_ShowsWarning", async () => {
      // Arrange - Mock useDataExtensionDetails to return hasPrimaryKey: false
      mockUseDataExtensionDetails.mockReturnValue({
        data: { hasPrimaryKey: false, fieldCount: 5, fields: [] },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useDataExtensionDetails>);

      const user = userEvent.setup();
      render(<QueryActivityModal {...defaultProps} />);

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      await user.click(screen.getByRole("option", { name: /subscribers/i }));

      // Act - Select Update mode
      const updateButton = screen.getByRole("radio", { name: /update/i });
      await user.click(updateButton);

      // Assert - PK warning should be displayed
      expect(
        screen.getByText(/update mode requires a primary key/i),
      ).toBeInTheDocument();
    });

    it("QueryActivityModal_UpdateModeNoPrimaryKey_DisablesDeployButton", async () => {
      // Arrange - Mock useDataExtensionDetails to return hasPrimaryKey: false
      mockUseDataExtensionDetails.mockReturnValue({
        data: { hasPrimaryKey: false, fieldCount: 5, fields: [] },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useDataExtensionDetails>);

      const user = userEvent.setup();
      render(<QueryActivityModal {...defaultProps} />);

      // Act - Fill activity name
      const activityNameInput = screen.getByLabelText(/activity name/i);
      await user.type(activityNameInput, "My Query Activity");

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      await user.click(screen.getByRole("option", { name: /subscribers/i }));

      // Act - Select Update mode
      const updateButton = screen.getByRole("radio", { name: /update/i });
      await user.click(updateButton);

      // Assert - Deploy button should be disabled
      const deployButton = screen.getByRole("button", {
        name: /deploy activity/i,
      });
      expect(deployButton).toBeDisabled();
    });
  });
});
