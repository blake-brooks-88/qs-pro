import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Folder } from "@/features/editor-workspace/types";

import { DataExtensionModal } from "../DataExtensionModal";

describe("DataExtensionModal", () => {
  const mockFolders: Folder[] = [
    {
      id: "123",
      name: "Data Extensions",
      parentId: null,
      type: "data-extension",
    },
    { id: "456", name: "Library Folder", parentId: null, type: "library" },
    { id: "789", name: "Subfolder", parentId: "123", type: "data-extension" },
    {
      id: "sdv-001",
      name: "System Data Views",
      parentId: null,
      type: "data-extension",
    },
  ];

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    folders: mockFolders,
  };

  /**
   * Helper to select a folder using the FolderTreePicker.
   * Opens the picker, optionally expands parent folder, then clicks the target folder.
   */
  async function selectFolder(
    user: ReturnType<typeof userEvent.setup>,
    folderName: string,
    parentFolderName?: string,
  ) {
    // Open the folder picker
    const folderPicker = screen.getByRole("combobox", { name: /folder/i });
    await user.click(folderPicker);

    // If folder is nested, expand parent first
    if (parentFolderName) {
      const expandButton = screen.getByRole("button", {
        name: /expand folder/i,
      });
      await user.click(expandButton);
    }

    // Click the target folder
    const folderOption = screen.getByRole("button", { name: folderName });
    await user.click(folderOption);
  }

  describe("field list management", () => {
    it("DataExtensionModal_NoFields_DisplaysEmptyState", () => {
      // Arrange
      render(<DataExtensionModal {...defaultProps} />);

      // Assert
      expect(screen.getByText(/no fields added yet/i)).toBeInTheDocument();
    });

    it("DataExtensionModal_AddFieldClicked_AddsNewFieldRow", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act
      await user.click(screen.getByRole("button", { name: /add field/i }));

      // Assert
      expect(screen.getByPlaceholderText("Field name")).toBeInTheDocument();
      expect(
        screen.queryByText(/no fields added yet/i),
      ).not.toBeInTheDocument();
    });

    it("DataExtensionModal_RemoveFieldClicked_RemovesFieldRow", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act - Add a field first
      await user.click(screen.getByRole("button", { name: /add field/i }));
      expect(screen.getByPlaceholderText("Field name")).toBeInTheDocument();

      // Act - Remove the field
      await user.click(screen.getByRole("button", { name: /remove field/i }));

      // Assert
      expect(
        screen.queryByPlaceholderText("Field name"),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/no fields added yet/i)).toBeInTheDocument();
    });

    it("DataExtensionModal_FieldNameEdited_UpdatesFieldName", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act
      await user.click(screen.getByRole("button", { name: /add field/i }));
      const fieldNameInput = screen.getByPlaceholderText("Field name");
      await user.type(fieldNameInput, "SubscriberKey");

      // Assert
      expect(fieldNameInput).toHaveValue("SubscriberKey");
    });

    it("DataExtensionModal_FieldTypeChanged_UpdatesFieldType", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act
      await user.click(screen.getByRole("button", { name: /add field/i }));
      // Field type select is the only native <select> for field configuration
      const fieldTypeSelect = screen.getByDisplayValue("Text"); // Default value
      await user.selectOptions(fieldTypeSelect, "Number");

      // Assert
      expect(fieldTypeSelect).toHaveValue("Number");
    });
  });

  describe("form validation", () => {
    it("DataExtensionModal_EmptyName_DisablesSaveButton", () => {
      // Arrange
      render(<DataExtensionModal {...defaultProps} />);

      // Assert
      const saveButton = screen.getByRole("button", {
        name: /create data extension/i,
      });
      expect(saveButton).toBeDisabled();
    });

    it("DataExtensionModal_EmptyCustomerKey_DisablesSaveButton", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);
      const nameInput = screen.getByLabelText(/^name$/i);

      // Act - Fill only name, leave customer key empty
      await user.type(nameInput, "My Data Extension");

      // Assert
      const saveButton = screen.getByRole("button", {
        name: /create data extension/i,
      });
      expect(saveButton).toBeDisabled();
    });

    it("DataExtensionModal_MissingFolder_DisablesSaveButton", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);
      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill name and key but no folder
      await user.type(nameInput, "My Data Extension");
      await user.type(customerKeyInput, "my_de_key");

      // Assert - Still disabled without folder
      const saveButton = screen.getByRole("button", {
        name: /create data extension/i,
      });
      expect(saveButton).toBeDisabled();
    });

    it("DataExtensionModal_ValidNameCustomerKeyAndFolder_EnablesSaveButton", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);
      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act
      await user.type(nameInput, "My Data Extension");
      await user.type(customerKeyInput, "my_de_key");
      await selectFolder(user, "Data Extensions");

      // Assert
      const saveButton = screen.getByRole("button", {
        name: /create data extension/i,
      });
      expect(saveButton).toBeEnabled();
    });

    it("DataExtensionModal_InvalidDEName_DisablesSaveButton", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);
      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Use invalid name starting with underscore
      await user.type(nameInput, "_InvalidName");
      await user.type(customerKeyInput, "my_de_key");
      await selectFolder(user, "Data Extensions");

      // Assert
      const saveButton = screen.getByRole("button", {
        name: /create data extension/i,
      });
      expect(saveButton).toBeDisabled();
      expect(
        screen.getByText(/cannot start with underscore/i),
      ).toBeInTheDocument();
    });
  });

  describe("folder picker", () => {
    it("DataExtensionModal_FolderPicker_OnlyShowsDataExtensionFolders", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act - Open the folder picker
      const folderPicker = screen.getByRole("combobox", { name: /folder/i });
      await user.click(folderPicker);

      // Assert - Should show DE folders but not library folders
      const listbox = screen.getByRole("listbox");
      expect(within(listbox).getByText("Data Extensions")).toBeInTheDocument();
      expect(
        within(listbox).queryByText("Library Folder"),
      ).not.toBeInTheDocument();
    });

    it("DataExtensionModal_FolderPicker_ExcludesSystemDataViews", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act - Open the folder picker
      const folderPicker = screen.getByRole("combobox", { name: /folder/i });
      await user.click(folderPicker);

      // Assert - System Data Views (sdv-*) should not be shown
      const listbox = screen.getByRole("listbox");
      expect(
        within(listbox).queryByText("System Data Views"),
      ).not.toBeInTheDocument();
    });

    it("DataExtensionModal_FolderPicker_ShowsNestedFoldersOnExpand", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act - Open the folder picker and expand parent
      const folderPicker = screen.getByRole("combobox", { name: /folder/i });
      await user.click(folderPicker);
      const expandButton = screen.getByRole("button", {
        name: /expand folder/i,
      });
      await user.click(expandButton);

      // Assert - Subfolder should now be visible
      const listbox = screen.getByRole("listbox");
      expect(within(listbox).getByText("Subfolder")).toBeInTheDocument();
    });

    it("DataExtensionModal_FolderSelected_ShowsBreadcrumbPath", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act - Select a nested folder
      await selectFolder(user, "Subfolder", "Data Extensions");

      // Assert - Breadcrumb should show full path
      expect(
        screen.getByText("Data Extensions > Subfolder"),
      ).toBeInTheDocument();
    });
  });

  describe("sendable toggle", () => {
    it("DataExtensionModal_SendableToggle_ShowsSubscriberKeyFieldWhenEnabled", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Assert - Subscriber key field not visible initially
      expect(
        screen.queryByLabelText(/subscriber key field/i),
      ).not.toBeInTheDocument();

      // Act - Enable sendable
      await user.click(
        screen.getByRole("button", { name: /toggle sendable/i }),
      );

      // Assert - Subscriber key field now visible
      expect(
        screen.getByLabelText(/subscriber key field/i),
      ).toBeInTheDocument();
    });

    it("DataExtensionModal_SendableEnabled_RequiresSubscriberKeyField", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);
      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill valid form data
      await user.type(nameInput, "My Data Extension");
      await user.type(customerKeyInput, "my_de_key");
      await selectFolder(user, "Data Extensions");

      // Act - Enable sendable without selecting subscriber key field
      await user.click(
        screen.getByRole("button", { name: /toggle sendable/i }),
      );

      // Assert - Save button should be disabled
      const saveButton = screen.getByRole("button", {
        name: /create data extension/i,
      });
      expect(saveButton).toBeDisabled();
    });

    it("DataExtensionModal_SendableWithSubscriberKey_EnablesSaveButton", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);
      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Add a Text field first
      await user.click(screen.getByRole("button", { name: /add field/i }));
      const fieldNameInput = screen.getByPlaceholderText("Field name");
      await user.type(fieldNameInput, "Email");

      // Act - Fill form
      await user.type(nameInput, "My Data Extension");
      await user.type(customerKeyInput, "my_de_key");
      await selectFolder(user, "Data Extensions");

      // Act - Enable sendable and select subscriber key field
      await user.click(
        screen.getByRole("button", { name: /toggle sendable/i }),
      );
      const subscriberKeySelect =
        screen.getByLabelText(/subscriber key field/i);
      await user.selectOptions(subscriberKeySelect, "Email");

      // Assert
      const saveButton = screen.getByRole("button", {
        name: /create data extension/i,
      });
      expect(saveButton).toBeEnabled();
    });
  });

  describe("decimal field options", () => {
    it("DataExtensionModal_DecimalField_ShowsScalePrecisionInputs", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act - Add a field and change to Decimal
      await user.click(screen.getByRole("button", { name: /add field/i }));
      // Field type select defaults to "Text"
      const fieldTypeSelect = screen.getByDisplayValue("Text");
      await user.selectOptions(fieldTypeSelect, "Decimal");

      // Assert - Scale and precision inputs should appear
      expect(screen.getByLabelText(/precision/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/scale/i)).toBeInTheDocument();
    });
  });

  describe("initial fields", () => {
    it("DataExtensionModal_InitialFields_PopulatesFieldList", () => {
      // Arrange
      const initialFields = [
        {
          id: "1",
          name: "SubscriberKey",
          type: "Text" as const,
          isPrimaryKey: true,
          isNullable: false,
        },
        {
          id: "2",
          name: "Email",
          type: "EmailAddress" as const,
          isPrimaryKey: false,
          isNullable: false,
        },
      ];

      // Act
      render(
        <DataExtensionModal {...defaultProps} initialFields={initialFields} />,
      );

      // Assert
      const fieldNameInputs = screen.getAllByPlaceholderText("Field name");
      expect(fieldNameInputs).toHaveLength(2);
      expect(fieldNameInputs[0]).toHaveValue("SubscriberKey");
      expect(fieldNameInputs[1]).toHaveValue("Email");
    });
  });

  describe("save callback", () => {
    it("DataExtensionModal_OnSave_CallsWithCorrectDataStructure", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form
      await user.type(nameInput, "  Test DE  ");
      await user.type(customerKeyInput, "  test_key  ");
      await selectFolder(user, "Data Extensions");

      // Act - Add a field
      await user.click(screen.getByRole("button", { name: /add field/i }));
      const fieldNameInput = screen.getByPlaceholderText("Field name");
      await user.type(fieldNameInput, "EmailAddress");
      // Field type select defaults to "Text"
      const fieldTypeSelect = screen.getByDisplayValue("Text");
      await user.selectOptions(fieldTypeSelect, "EmailAddress");

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test DE",
          customerKey: "test_key",
          folderId: "123",
          isSendable: false,
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "EmailAddress",
              type: "EmailAddress",
            }),
          ]),
        }),
      );
    });

    it("DataExtensionModal_OnSave_IncludesSendableData", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Add a field first
      await user.click(screen.getByRole("button", { name: /add field/i }));
      const fieldNameInput = screen.getByPlaceholderText("Field name");
      await user.type(fieldNameInput, "Email");

      // Act - Fill form
      await user.type(nameInput, "Test DE");
      await user.type(customerKeyInput, "test_key");
      await selectFolder(user, "Data Extensions");

      // Act - Enable sendable and select subscriber key
      await user.click(
        screen.getByRole("button", { name: /toggle sendable/i }),
      );
      const subscriberKeySelect =
        screen.getByLabelText(/subscriber key field/i);
      await user.selectOptions(subscriberKeySelect, "Email");

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          isSendable: true,
          subscriberKeyField: "Email",
        }),
      );
    });
  });
});
