import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DataExtension,
  DataExtensionField,
  Folder,
} from "@/features/editor-workspace/types";

import { TargetDataExtensionModal } from "../TargetDataExtensionModal";

// Mock useDataExtensionFields hook to control field loading and data states
const mockUseDataExtensionFields = vi.fn();
vi.mock("@/features/editor-workspace/hooks/use-metadata", () => ({
  useDataExtensionFields: (...args: unknown[]) =>
    mockUseDataExtensionFields(...args),
}));

// Mock TargetDECreationView as a simple stub to avoid complex nested mocking
vi.mock("../TargetDECreationView", () => ({
  TargetDECreationView: ({
    onBack,
    onCreated,
  }: {
    onBack: () => void;
    onCreated: (de: DataExtension) => void;
  }) => (
    <div data-testid="target-de-creation-view">
      <button onClick={onBack}>Back to Selection</button>
      <button
        onClick={() =>
          onCreated({
            id: "new-de-id",
            name: "New DE",
            customerKey: "new_de_key",
            folderId: "123",
            description: "",
            fields: [],
            isShared: false,
          })
        }
      >
        Simulate Create
      </button>
    </div>
  ),
}));

function createMockDataExtensions(): DataExtension[] {
  return [
    {
      id: "de-1",
      name: "Subscribers",
      customerKey: "subscribers_key",
      folderId: "f1",
      description: "Subscriber data",
      fields: [
        {
          id: "f1",
          name: "SubscriberKey",
          type: "Text",
          isPrimaryKey: true,
          isNullable: false,
          length: 254,
        },
        {
          id: "f2",
          name: "EmailAddress",
          type: "EmailAddress",
          isPrimaryKey: false,
          isNullable: false,
        },
      ],
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
      id: "123",
      name: "Data Extensions",
      parentId: null,
      type: "data-extension",
    },
  ];
}

function createMockTargetFields(): DataExtensionField[] {
  return [
    {
      id: "f1",
      name: "SubscriberKey",
      type: "Text",
      isPrimaryKey: true,
      isNullable: false,
      length: 254,
    },
    {
      id: "f2",
      name: "EmailAddress",
      type: "EmailAddress",
      isPrimaryKey: false,
      isNullable: false,
    },
  ];
}

function selectDropdownTarget(buttons: HTMLElement[]): HTMLElement {
  const last = buttons.at(-1);
  if (!last) {
    throw new Error("Expected at least one button in dropdown");
  }
  return last;
}

describe("TargetDataExtensionModal", () => {
  const defaultProps = {
    isOpen: true,
    tenantId: "tenant-123",
    eid: "eid-456",
    dataExtensions: createMockDataExtensions(),
    folders: createMockFolders(),
    queryClient: {} as never,
    sqlText: "SELECT SubscriberKey, EmailAddress FROM MyDE",
    onClose: vi.fn(),
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: fields loaded successfully with compatible fields
    mockUseDataExtensionFields.mockReturnValue({
      data: createMockTargetFields(),
      isLoading: false,
      error: null,
    });
  });

  describe("view transitions", () => {
    it("clicking Create New switches to creation view", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Assert - Selection view shows initially
      expect(
        screen.getByPlaceholderText(/search by name or customer key/i),
      ).toBeInTheDocument();

      // Act - Click "Create New" button
      await user.click(screen.getByRole("button", { name: /create new/i }));

      // Assert - Creation view is now shown (mocked component)
      await waitFor(() => {
        expect(
          screen.getByTestId("target-de-creation-view"),
        ).toBeInTheDocument();
      });
    });

    it("back button in creation view returns to selection view", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Switch to creation view
      await user.click(screen.getByRole("button", { name: /create new/i }));
      await waitFor(() => {
        expect(
          screen.getByTestId("target-de-creation-view"),
        ).toBeInTheDocument();
      });

      // Act - Click back button (from mocked component)
      await user.click(
        screen.getByRole("button", { name: /back to selection/i }),
      );

      // Assert - Selection view is shown again
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(/search by name or customer key/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("selection view", () => {
    it("shows search input when no target selected", () => {
      // Arrange & Act
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Assert
      expect(
        screen.getByPlaceholderText(/search by name or customer key/i),
      ).toBeInTheDocument();
    });

    it("shows dropdown with data extensions when search is focused", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act
      await user.click(searchInput);

      // Assert - Dropdown shows all DEs
      expect(screen.getByText("Subscribers")).toBeInTheDocument();
      expect(screen.getByText("Products")).toBeInTheDocument();
      expect(screen.getByText("Orders")).toBeInTheDocument();
    });

    it("selecting a target displays selected card with name and customerKey", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act - Focus to show dropdown, then select a target
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      // Click the one in the dropdown (not the title)
      await user.click(selectDropdownTarget(subscribersButtons));

      // Assert - Selected card is shown with name and customerKey
      expect(
        screen.queryByPlaceholderText(/search by name or customer key/i),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Subscribers")).toBeInTheDocument();
      expect(screen.getByText("subscribers_key")).toBeInTheDocument();
    });

    it("clearing selection returns to search input", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Select a target first
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Verify selected state
      expect(screen.getByText("subscribers_key")).toBeInTheDocument();

      // Act - Click the clear button
      const clearButton = screen.getByRole("button", { name: "" });
      await user.click(clearButton);

      // Assert - Search input returns
      expect(
        screen.getByPlaceholderText(/search by name or customer key/i),
      ).toBeInTheDocument();
    });
  });

  describe("compatibility checking", () => {
    it('shows "Checking compatibility..." while loading fields', async () => {
      // Arrange - Set loading state
      mockUseDataExtensionFields.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      });

      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Assert - Loading state shown
      expect(screen.getByText(/checking compatibility/i)).toBeInTheDocument();
    });

    it("shows compatible state when query columns match target fields", async () => {
      // Arrange - Fields match SQL output columns
      mockUseDataExtensionFields.mockReturnValue({
        data: createMockTargetFields(),
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Assert - Compatible state shown
      await waitFor(() => {
        expect(
          screen.getByText(/target data extension is compatible/i),
        ).toBeInTheDocument();
      });
    });

    it("shows incompatible state when query columns missing from target", async () => {
      // Arrange - Target fields don't include one of the SQL output columns
      mockUseDataExtensionFields.mockReturnValue({
        data: [
          {
            id: "f1",
            name: "SubscriberKey",
            type: "Text",
            isPrimaryKey: true,
            isNullable: false,
            length: 254,
          },
          // EmailAddress is missing
        ],
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Assert - Incompatible state shown
      await waitFor(() => {
        expect(
          screen.getByText(/target data extension is not compatible/i),
        ).toBeInTheDocument();
      });
    });

    it("shows details when View details button is clicked for incompatible state", async () => {
      // Arrange - Target fields don't include one of the SQL output columns
      mockUseDataExtensionFields.mockReturnValue({
        data: [
          {
            id: "f1",
            name: "SubscriberKey",
            type: "Text",
            isPrimaryKey: true,
            isNullable: false,
            length: 254,
          },
        ],
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Wait for incompatible state
      await waitFor(() => {
        expect(
          screen.getByText(/target data extension is not compatible/i),
        ).toBeInTheDocument();
      });

      // Act - Click View details
      await user.click(screen.getByRole("button", { name: /view details/i }));

      // Assert - Missing fields are shown
      expect(screen.getByText(/missing in target/i)).toBeInTheDocument();
      expect(screen.getByText("EmailAddress")).toBeInTheDocument();
    });
  });

  describe("run button behavior", () => {
    it("run button is disabled when no target selected", () => {
      // Arrange & Act
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Assert
      const runButton = screen.getByRole("button", { name: /run query/i });
      expect(runButton).toBeDisabled();
    });

    it("run button is disabled when target is incompatible", async () => {
      // Arrange - Make incompatible
      mockUseDataExtensionFields.mockReturnValue({
        data: [
          {
            id: "f1",
            name: "DifferentField",
            type: "Text",
            isPrimaryKey: true,
            isNullable: false,
            length: 254,
          },
        ],
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Wait for incompatible state
      await waitFor(() => {
        expect(
          screen.getByText(/target data extension is not compatible/i),
        ).toBeInTheDocument();
      });

      // Assert
      const runButton = screen.getByRole("button", { name: /run query/i });
      expect(runButton).toBeDisabled();
    });

    it("run button is enabled when target is compatible", async () => {
      // Arrange - Fields match
      mockUseDataExtensionFields.mockReturnValue({
        data: createMockTargetFields(),
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Wait for compatible state
      await waitFor(() => {
        expect(
          screen.getByText(/target data extension is compatible/i),
        ).toBeInTheDocument();
      });

      // Assert
      const runButton = screen.getByRole("button", { name: /run query/i });
      expect(runButton).not.toBeDisabled();
    });

    it("run button calls onSelect with customerKey when clicked", async () => {
      // Arrange
      const onSelect = vi.fn();
      mockUseDataExtensionFields.mockReturnValue({
        data: createMockTargetFields(),
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(
        <TargetDataExtensionModal {...defaultProps} onSelect={onSelect} />,
      );

      // Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Wait for compatible state
      await waitFor(() => {
        expect(
          screen.getByText(/target data extension is compatible/i),
        ).toBeInTheDocument();
      });

      // Act - Click run button
      await user.click(screen.getByRole("button", { name: /run query/i }));

      // Assert
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith("subscribers_key", "Overwrite");
    });
  });

  describe("search filtering", () => {
    it("filters by customerKey when typed in search", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act - Type a customerKey substring
      await user.type(searchInput, "products_key");

      // Assert - Only the matching DE appears
      expect(screen.getByText("Products")).toBeInTheDocument();
      expect(screen.queryByText("Subscribers")).not.toBeInTheDocument();
      expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    });

    it("shows empty state when no data extensions match search", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );

      // Act - Type a non-matching term
      await user.type(searchInput, "zzz_nonexistent_zzz");

      // Assert - Empty state shown
      expect(
        screen.getByText(/no matching data extensions found/i),
      ).toBeInTheDocument();
    });
  });

  describe("sql preview", () => {
    it("truncates SQL preview when text exceeds 100 characters", () => {
      // Arrange - Create SQL > 100 chars
      const longSql = `SELECT SubscriberKey, EmailAddress, FirstName, LastName, PhoneNumber, Address FROM VeryLongTableNameHere`;

      // Act
      render(<TargetDataExtensionModal {...defaultProps} sqlText={longSql} />);

      // Assert - Preview should be truncated with ellipsis
      const preview = screen.getByText(/\.\.\./);
      expect(preview).toBeInTheDocument();
      expect(preview.textContent?.length).toBeLessThan(longSql.length);
    });
  });

  describe("compatibility edge cases", () => {
    it("shows unknown when target fields are empty", async () => {
      // Arrange - Target has no fields and query returns empty array
      mockUseDataExtensionFields.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Assert - Unknown state with missing metadata message
      await waitFor(() => {
        expect(
          screen.getByText(/unable to validate compatibility/i),
        ).toBeInTheDocument();
      });
    });

    it("shows unknown when SQL uses SELECT *", async () => {
      // Arrange - SELECT * cannot be validated
      mockUseDataExtensionFields.mockReturnValue({
        data: createMockTargetFields(),
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(
        <TargetDataExtensionModal
          {...defaultProps}
          sqlText="SELECT * FROM MyDE"
        />,
      );

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Assert - Unknown state since SELECT * can't be validated
      await waitFor(() => {
        expect(
          screen.getByText(/unable to validate compatibility/i),
        ).toBeInTheDocument();
      });
    });

    it("shows required fields missing from query in details", async () => {
      // Arrange - Target has a required field "Status" not in SELECT
      mockUseDataExtensionFields.mockReturnValue({
        data: [
          ...createMockTargetFields(),
          {
            id: "f3",
            name: "Status",
            type: "Text",
            isPrimaryKey: false,
            isNullable: false,
            length: 50,
          },
        ],
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Wait for incompatible state
      await waitFor(() => {
        expect(
          screen.getByText(/target data extension is not compatible/i),
        ).toBeInTheDocument();
      });

      // Act - Expand details
      await user.click(screen.getByRole("button", { name: /view details/i }));

      // Assert - Required fields missing section shown
      expect(
        screen.getByText(/required fields not selected/i),
      ).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("shows duplicate output columns in details", async () => {
      // Arrange - SQL with duplicate column names
      mockUseDataExtensionFields.mockReturnValue({
        data: [
          {
            id: "f1",
            name: "SubscriberKey",
            type: "Text",
            isPrimaryKey: true,
            isNullable: false,
            length: 254,
          },
        ],
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(
        <TargetDataExtensionModal
          {...defaultProps}
          sqlText="SELECT SubscriberKey, SubscriberKey FROM MyDE"
        />,
      );

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Wait for incompatible state
      await waitFor(() => {
        expect(
          screen.getByText(/target data extension is not compatible/i),
        ).toBeInTheDocument();
      });

      // Act - Expand details
      await user.click(screen.getByRole("button", { name: /view details/i }));

      // Assert - Duplicate columns section shown
      expect(screen.getByText(/duplicate output columns/i)).toBeInTheDocument();
    });

    it("normalizes bracket-wrapped field names for compatibility check", async () => {
      // Arrange - Target fields with bracket notation, SQL without brackets
      mockUseDataExtensionFields.mockReturnValue({
        data: [
          {
            id: "f1",
            name: "[SubscriberKey]",
            type: "Text",
            isPrimaryKey: true,
            isNullable: false,
            length: 254,
          },
          {
            id: "f2",
            name: "[EmailAddress]",
            type: "EmailAddress",
            isPrimaryKey: false,
            isNullable: false,
          },
        ],
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(<TargetDataExtensionModal {...defaultProps} />);

      // Act - Select a target
      const searchInput = screen.getByPlaceholderText(
        /search by name or customer key/i,
      );
      await user.click(searchInput);
      const subscribersButtons = screen.getAllByText("Subscribers");
      await user.click(selectDropdownTarget(subscribersButtons));

      // Assert - Should be compatible despite bracket wrapping
      await waitFor(() => {
        expect(
          screen.getByText(/target data extension is compatible/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Create New button visibility", () => {
    it("hides Create New button when queryClient is not provided", () => {
      // Arrange & Act
      render(
        <TargetDataExtensionModal
          {...defaultProps}
          queryClient={undefined}
          folders={undefined}
        />,
      );

      // Assert - Create New button should not be present
      expect(
        screen.queryByRole("button", { name: /create new/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("creation flow integration", () => {
    it("created DE becomes selected after creation flow completes", async () => {
      // Arrange
      const dataExtensions = [
        ...createMockDataExtensions(),
        {
          id: "new-de-id",
          name: "New DE",
          customerKey: "new_de_key",
          folderId: "123",
          description: "",
          fields: [],
          isShared: false,
        },
      ];

      const user = userEvent.setup();
      render(
        <TargetDataExtensionModal
          {...defaultProps}
          dataExtensions={dataExtensions}
        />,
      );

      // Switch to creation view
      await user.click(screen.getByRole("button", { name: /create new/i }));
      await waitFor(() => {
        expect(
          screen.getByTestId("target-de-creation-view"),
        ).toBeInTheDocument();
      });

      // Act - Simulate DE creation (mocked component callback)
      await user.click(
        screen.getByRole("button", { name: /simulate create/i }),
      );

      // Assert - Should return to selection view with new DE selected
      await waitFor(() => {
        expect(screen.getByText("New DE")).toBeInTheDocument();
        expect(screen.getByText("new_de_key")).toBeInTheDocument();
      });
    });
  });
});
