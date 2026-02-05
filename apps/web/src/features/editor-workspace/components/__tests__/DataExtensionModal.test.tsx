import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DataExtension, Folder } from "@/features/editor-workspace/types";

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
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Id");

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

  describe("retention policy", () => {
    it("DataExtensionModal_RetentionToggle_ShowsPeriodDateOptions", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Assert - Period/Date options not visible initially
      expect(screen.queryByLabelText(/period/i)).not.toBeInTheDocument();

      // Act - Enable retention policy
      await user.click(
        screen.getByRole("button", { name: /toggle retention policy/i }),
      );

      // Assert - Period and Date radio buttons appear
      expect(
        screen.getByRole("radio", { name: /period/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /date/i })).toBeInTheDocument();
    });

    it("DataExtensionModal_RetentionPeriodMode_ShowsLengthAndUnitInputs", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act - Enable retention policy (period mode is default)
      await user.click(
        screen.getByRole("button", { name: /toggle retention policy/i }),
      );

      // Assert - Length and unit inputs appear
      expect(screen.getByLabelText(/length/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/unit/i)).toBeInTheDocument();
    });

    it("DataExtensionModal_RetentionDeleteType_RadioButtonsWork", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act - Enable retention policy
      await user.click(
        screen.getByRole("button", { name: /toggle retention policy/i }),
      );

      // Assert - Default is "all"
      const allRadio = screen.getByRole("radio", {
        name: /delete all rows at once/i,
      });
      const individualRadio = screen.getByRole("radio", {
        name: /delete individual rows/i,
      });
      expect(allRadio).toBeChecked();
      expect(individualRadio).not.toBeChecked();

      // Act - Select "individual"
      await user.click(individualRadio);

      // Assert - Selection changed
      expect(individualRadio).toBeChecked();
      expect(allRadio).not.toBeChecked();
    });

    it("DataExtensionModal_RetentionEnabled_IncludesRetentionInDraft", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form
      await user.type(nameInput, "Test DE");
      await user.type(customerKeyInput, "test_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Id");

      // Act - Enable retention policy with period mode
      await user.click(
        screen.getByRole("button", { name: /toggle retention policy/i }),
      );

      // Act - Set period length to 60 and unit to Weeks
      const lengthInput = screen.getByLabelText(/length/i);
      await user.clear(lengthInput);
      await user.type(lengthInput, "60");
      const unitSelect = screen.getByLabelText(/unit/i);
      await user.selectOptions(unitSelect, "Weeks");

      // Act - Select individual delete type
      await user.click(
        screen.getByRole("radio", { name: /delete individual rows/i }),
      );

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          retention: expect.objectContaining({
            type: "period",
            periodLength: 60,
            periodUnit: "Weeks",
            deleteType: "individual",
          }),
        }),
      );
    });

    it("DataExtensionModal_RetentionDisabled_OmitsRetentionFromDraft", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form without enabling retention
      await user.type(nameInput, "Test DE");
      await user.type(customerKeyInput, "test_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Id");

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert - retention should be undefined when disabled
      expect(onSave).toHaveBeenCalledTimes(1);
      const calledWith = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(calledWith.retention).toBeUndefined();
    });

    it("DataExtensionModal_RetentionDateMode_IncludesDateRetentionInDraft", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form
      await user.type(nameInput, "Retention DE");
      await user.type(customerKeyInput, "ret_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Id");

      // Act - Enable retention and switch to date mode
      await user.click(
        screen.getByRole("button", { name: /toggle retention policy/i }),
      );
      await user.click(screen.getByRole("radio", { name: /^date$/i }));

      // Assert - Retain Until input appears
      const retainUntilInput = screen.getByLabelText(/retain until/i);
      expect(retainUntilInput).toBeInTheDocument();

      // Act - Set a future date via fireEvent to avoid Popover focus interference
      fireEvent.change(retainUntilInput, {
        target: { value: "2099-12-31" },
      });

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          retention: expect.objectContaining({
            type: "date",
            retainUntil: "2099-12-31",
            deleteType: "all",
            resetOnImport: false,
            deleteAtEnd: false,
          }),
        }),
      );
    });

    it("DataExtensionModal_RetentionDateMode_PastDateShowsError", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act - Enable retention and switch to date mode
      await user.click(
        screen.getByRole("button", { name: /toggle retention policy/i }),
      );
      await user.click(screen.getByRole("radio", { name: /^date$/i }));

      // Act - Set a past date via fireEvent to avoid Popover focus interference
      const retainUntilInput = screen.getByLabelText(/retain until/i);
      fireEvent.change(retainUntilInput, {
        target: { value: "2000-01-01" },
      });

      // Assert - Error message appears
      expect(
        screen.getByText(/retain-until date must be today or later/i),
      ).toBeInTheDocument();
    });

    it("DataExtensionModal_RetentionCheckboxes_IncludeResetAndDeleteFlags", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill valid form
      await user.type(nameInput, "Flags DE");
      await user.type(customerKeyInput, "flags_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Id");

      // Act - Enable retention and toggle checkboxes
      await user.click(
        screen.getByRole("button", { name: /toggle retention policy/i }),
      );
      await user.click(
        screen.getByRole("checkbox", { name: /reset on import/i }),
      );
      await user.click(
        screen.getByRole("checkbox", {
          name: /delete data extension at end/i,
        }),
      );

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          retention: expect.objectContaining({
            resetOnImport: true,
            deleteAtEnd: true,
          }),
        }),
      );
    });
  });

  describe("field type interactions", () => {
    it("DataExtensionModal_DecimalField_PrecisionAndScaleEditable", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form and add a Decimal field
      await user.type(nameInput, "Decimal DE");
      await user.type(customerKeyInput, "decimal_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Price");
      await user.selectOptions(screen.getByDisplayValue("Text"), "Decimal");

      // Act - Edit precision and scale
      const precisionInput = screen.getByLabelText(/precision/i);
      const scaleInput = screen.getByLabelText(/scale/i);
      await user.clear(precisionInput);
      await user.type(precisionInput, "10");
      await user.clear(scaleInput);
      await user.type(scaleInput, "4");

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "Price",
              type: "Decimal",
              precision: 10,
              scale: 4,
            }),
          ]),
        }),
      );
    });

    it("DataExtensionModal_BooleanField_DefaultValueSelectable", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form and add a Boolean field
      await user.type(nameInput, "Boolean DE");
      await user.type(customerKeyInput, "bool_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "IsActive");
      await user.selectOptions(screen.getByDisplayValue("Text"), "Boolean");

      // Act - Select "True" as default value
      const defaultSelects = screen.getAllByDisplayValue("");
      const boolDefaultSelect = defaultSelects.find(
        (el) =>
          el.tagName === "SELECT" && el.querySelector("option[value='True']"),
      ) as HTMLSelectElement;
      expect(boolDefaultSelect).toBeDefined();
      await user.selectOptions(boolDefaultSelect, "True");

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "IsActive",
              type: "Boolean",
              defaultValue: "True",
            }),
          ]),
        }),
      );
    });

    it("DataExtensionModal_DateField_NowButtonTogglesDefault", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form and add a Date field
      await user.type(nameInput, "Date DE");
      await user.type(customerKeyInput, "date_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "CreatedDate");
      await user.selectOptions(screen.getByDisplayValue("Text"), "Date");

      // Act - Click the Now toggle button
      const nowButton = screen.getByRole("button", {
        name: /toggle current date default/i,
      });
      await user.click(nowButton);

      // Assert - "Now()" text should appear
      expect(screen.getByText("Now()")).toBeInTheDocument();

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "CreatedDate",
              type: "Date",
              defaultValue: "Now()",
            }),
          ]),
        }),
      );
    });

    it("DataExtensionModal_DateField_NowButtonTogglesOff", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act - Add a Date field and toggle Now on then off
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "CreatedDate");
      await user.selectOptions(screen.getByDisplayValue("Text"), "Date");

      const nowButton = screen.getByRole("button", {
        name: /toggle current date default/i,
      });
      await user.click(nowButton); // On
      expect(screen.getByText("Now()")).toBeInTheDocument();

      await user.click(nowButton); // Off
      expect(screen.queryByText("Now()")).not.toBeInTheDocument();
    });

    it("DataExtensionModal_TextField_LengthEditable", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form and add a Text field with custom length
      await user.type(nameInput, "Length DE");
      await user.type(customerKeyInput, "len_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Code");

      // The default length for Text is 254 — find and change it
      const lengthInput = screen.getByDisplayValue("254");
      await user.clear(lengthInput);
      await user.type(lengthInput, "50");

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "Code",
              type: "Text",
              length: 50,
            }),
          ]),
        }),
      );
    });

    it("DataExtensionModal_PrimaryKey_TogglesPrimaryKeyFlag", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form and add a field
      await user.type(nameInput, "PK DE");
      await user.type(customerKeyInput, "pk_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Id");

      // Act - Toggle primary key
      await user.click(
        screen.getByRole("button", { name: /toggle primary key/i }),
      );

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "Id",
              isPrimaryKey: true,
            }),
          ]),
        }),
      );
    });

    it("DataExtensionModal_Nullable_TogglesNullableFlag", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form and add a field (nullable defaults to true)
      await user.type(nameInput, "Null DE");
      await user.type(customerKeyInput, "null_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Status");

      // Act - Toggle nullable off (default is true, clicking makes it false)
      await user.click(
        screen.getByRole("button", { name: /toggle nullable/i }),
      );

      // Act - Save
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "Status",
              isNullable: false,
            }),
          ]),
        }),
      );
    });
  });

  describe("advanced validation", () => {
    it("DataExtensionModal_DuplicateDEName_ShowsErrorAndDisablesSave", async () => {
      // Arrange
      const user = userEvent.setup();
      const existingDEs: DataExtension[] = [
        {
          id: "existing-key",
          name: "Existing DE",
          customerKey: "existing-key",
          folderId: "123",
          description: "",
          fields: [],
          isShared: false,
        },
      ];
      render(
        <DataExtensionModal {...defaultProps} dataExtensions={existingDEs} />,
      );

      // Act - Type the same name as an existing DE
      const nameInput = screen.getByLabelText(/^name$/i);
      await user.type(nameInput, "Existing DE");

      // Act - Attempt to submit to trigger validation display
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      expect(
        screen.getByText(
          /a data extension named "Existing DE" already exists/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /create data extension/i }),
      ).toBeDisabled();
    });

    it("DataExtensionModal_DuplicateFieldNames_ShowsErrorOnSubmitAttempt", async () => {
      // Arrange — start with a valid form so the submit button is enabled,
      // then after a failed save (which sets didAttemptSubmit), add a duplicate field.
      const user = userEvent.setup();
      const onSave = vi.fn().mockRejectedValue(new Error("server error"));
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill a valid form with one field
      await user.type(nameInput, "Dup Fields DE");
      await user.type(customerKeyInput, "dup_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      const fieldInputs = screen.getAllByPlaceholderText("Field name");
      await user.type(fieldInputs[0] as HTMLInputElement, "Email");

      // Act - Submit (onSave rejects, but didAttemptSubmit is now true)
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Act - Now add a second field with the same name
      await user.click(screen.getByRole("button", { name: /add field/i }));
      const updatedFieldInputs = screen.getAllByPlaceholderText("Field name");
      await user.type(updatedFieldInputs[1] as HTMLInputElement, "Email");

      // Assert - At least one duplicate field name error appears
      const dupErrors = screen.getAllByText(/field name must be unique/i);
      expect(dupErrors.length).toBeGreaterThanOrEqual(1);
    });

    it("DataExtensionModal_EmailAddressField_ShowsUnsupportedDefaultTooltip", async () => {
      // Arrange - render with an EmailAddress field to verify the
      // "default values not supported" tooltip placeholder renders.
      const user = userEvent.setup();
      const initialFields = [
        {
          id: "1",
          name: "ContactEmail",
          type: "EmailAddress" as const,
          isPrimaryKey: false,
          isNullable: true,
        },
      ];
      render(
        <DataExtensionModal {...defaultProps} initialFields={initialFields} />,
      );

      // Assert - The default value column shows "—" dash (not an input)
      // because EmailAddress fields do not support default values
      const dashElements = screen.getAllByText("—");
      expect(dashElements.length).toBeGreaterThanOrEqual(1);

      // Act - Hover over the dash to show the tooltip
      await user.hover(dashElements[0] as HTMLElement);

      // Assert - Tooltip content appears (may render in multiple portals)
      const tooltipTexts = await screen.findAllByText(
        /default values are not supported for this field type/i,
      );
      expect(tooltipTexts.length).toBeGreaterThanOrEqual(1);
    });

    it("DataExtensionModal_DecimalMissingPrecision_ShowsErrorOnSubmit", async () => {
      // Arrange — start with a valid Decimal field (has precision/scale),
      // submit to set didAttemptSubmit, then clear precision.
      const user = userEvent.setup();
      const onSave = vi.fn().mockRejectedValue(new Error("server error"));
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form with a valid Decimal field (defaults to P=18, S=2)
      await user.type(nameInput, "Dec Missing DE");
      await user.type(customerKeyInput, "dec_miss_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Amount");
      await user.selectOptions(screen.getByDisplayValue("Text"), "Decimal");

      // Act - Submit (onSave rejects, modal stays open, didAttemptSubmit = true)
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Act - Clear precision and scale to trigger validation errors
      const precisionInput = screen.getByLabelText(/precision/i);
      const scaleInput = screen.getByLabelText(/scale/i);
      await user.clear(precisionInput);
      await user.clear(scaleInput);

      // Assert
      expect(
        screen.getByText(/precision is required for decimal/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/scale is required for decimal/i),
      ).toBeInTheDocument();
    });

    it("DataExtensionModal_InvalidFormSubmit_DoesNotCallOnSave", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      // Act - Submit with empty form (no name, no fields)
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert - onSave should NOT have been called
      expect(onSave).not.toHaveBeenCalled();
    });

    it("DataExtensionModal_SubscriberKeyField_ResetsWhenFieldRenamed", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      // Act - Add a Text field
      await user.click(screen.getByRole("button", { name: /add field/i }));
      const fieldNameInput = screen.getByPlaceholderText("Field name");
      await user.type(fieldNameInput, "Email");

      // Act - Enable sendable and select the field as subscriber key
      await user.click(
        screen.getByRole("button", { name: /toggle sendable/i }),
      );
      const subscriberKeySelect =
        screen.getByLabelText(/subscriber key field/i);
      await user.selectOptions(subscriberKeySelect, "Email");
      expect(subscriberKeySelect).toHaveValue("Email");

      // Act - Change the field type to Number (no longer eligible for subscriber key)
      const fieldTypeSelect = screen.getByDisplayValue("Text");
      await user.selectOptions(fieldTypeSelect, "Number");

      // Assert - Subscriber key should reset since the field is no longer eligible
      expect(subscriberKeySelect).toHaveValue("");
    });

    it("DataExtensionModal_RetentionPeriodInvalid_ShowsErrorAndDisablesSave", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<DataExtensionModal {...defaultProps} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form
      await user.type(nameInput, "Invalid Period DE");
      await user.type(customerKeyInput, "inv_per_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Id");

      // Act - Enable retention and set invalid period (0)
      await user.click(
        screen.getByRole("button", { name: /toggle retention policy/i }),
      );
      const lengthInput = screen.getByLabelText(/length/i);
      await user.clear(lengthInput);
      await user.type(lengthInput, "0");

      // Assert
      expect(
        screen.getByText(/retention length must be between 1 and 999/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /create data extension/i }),
      ).toBeDisabled();
    });

    it("DataExtensionModal_DecimalScaleExceedsPrecision_ShowsError", async () => {
      // Arrange — start with valid Decimal, submit to set didAttemptSubmit,
      // then set scale > precision to trigger the error.
      const user = userEvent.setup();
      const onSave = vi.fn().mockRejectedValue(new Error("server error"));
      render(<DataExtensionModal {...defaultProps} onSave={onSave} />);

      const nameInput = screen.getByLabelText(/^name$/i);
      const customerKeyInput = screen.getByLabelText(/customer key/i);

      // Act - Fill form with valid Decimal (defaults P=18, S=2)
      await user.type(nameInput, "Scale Error DE");
      await user.type(customerKeyInput, "scale_err_key");
      await selectFolder(user, "Data Extensions");
      await user.click(screen.getByRole("button", { name: /add field/i }));
      await user.type(screen.getByPlaceholderText("Field name"), "Amount");
      await user.selectOptions(screen.getByDisplayValue("Text"), "Decimal");

      // Act - Submit to set didAttemptSubmit (onSave rejects, modal stays open)
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Act - Set scale > precision
      const precisionInput = screen.getByLabelText(/precision/i);
      const scaleInput = screen.getByLabelText(/scale/i);
      await user.clear(precisionInput);
      await user.type(precisionInput, "5");
      await user.clear(scaleInput);
      await user.type(scaleInput, "10");

      // Assert
      expect(
        screen.getByText(/scale must be less than or equal to precision/i),
      ).toBeInTheDocument();
    });
  });
});
