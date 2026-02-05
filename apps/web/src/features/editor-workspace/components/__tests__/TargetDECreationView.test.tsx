import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { metadataQueryKeys } from "@/features/editor-workspace/hooks/use-metadata";
import type {
  DataExtension,
  DataExtensionField,
  Folder,
} from "@/features/editor-workspace/types";

import { TargetDECreationView } from "../TargetDECreationView";

// Use vi.hoisted() to define mocks at hoisting time
const { mockInferSchemaFromQuery, mockCreateMetadataFetcher } = vi.hoisted(
  () => ({
    mockInferSchemaFromQuery: vi.fn(),
    mockCreateMetadataFetcher: vi.fn(),
  }),
);

// Mock external API boundary
vi.mock("@/services/metadata", () => ({
  createDataExtension: vi.fn(),
}));

// Mock sonner toast (external side-effect)
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock dynamic imports for schema-inferrer and metadata-fetcher
// Path is relative to the component file's import statement
vi.mock("../../utils/schema-inferrer", () => ({
  inferSchemaFromQuery: (...args: unknown[]) =>
    mockInferSchemaFromQuery(...args),
}));

vi.mock("../../utils/metadata-fetcher", () => ({
  createMetadataFetcher: (...args: unknown[]) =>
    mockCreateMetadataFetcher(...args),
}));

describe("TargetDECreationView", () => {
  const mockFolders: Folder[] = [
    {
      id: "123",
      name: "Data Extensions",
      parentId: null,
      type: "data-extension",
    },
  ];

  const mockDataExtensions: DataExtension[] = [];

  const mockInferredFields: DataExtensionField[] = [
    {
      id: "field-1",
      name: "SubscriberKey",
      type: "Text",
      isPrimaryKey: true,
      isNullable: false,
      length: 254,
    },
    {
      id: "field-2",
      name: "EmailAddress",
      type: "EmailAddress",
      isPrimaryKey: false,
      isNullable: false,
    },
  ];

  let queryClient: QueryClient;
  let mockOnBack: ReturnType<typeof vi.fn>;
  let mockOnCreated: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockOnBack = vi.fn();
    mockOnCreated = vi.fn();

    // Default: schema inference succeeds
    mockInferSchemaFromQuery.mockReset();
    mockInferSchemaFromQuery.mockResolvedValue(mockInferredFields);
    mockCreateMetadataFetcher.mockReset();
    mockCreateMetadataFetcher.mockReturnValue({
      getFieldsForTable: vi.fn(),
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderComponent = (
    props: Partial<React.ComponentProps<typeof TargetDECreationView>> = {},
  ) => {
    const defaultProps = {
      tenantId: "tenant-123",
      eid: "eid-456",
      sqlText: "SELECT SubscriberKey, EmailAddress FROM MyDE",
      folders: mockFolders,
      dataExtensions: mockDataExtensions,
      queryClient,
      onBack: mockOnBack,
      onCreated: mockOnCreated,
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <TargetDECreationView {...defaultProps} {...props} />
      </QueryClientProvider>,
    );
  };

  describe("schema inference loading", () => {
    it("displays loading skeleton while inferring schema", () => {
      // Arrange - Make inference hang
      mockInferSchemaFromQuery.mockImplementation(() => new Promise(() => {}));

      // Act
      renderComponent();

      // Assert - Should show pulse animation class (loading state indicator)
      const loadingContainer = document.querySelector(".animate-pulse");
      expect(loadingContainer).toBeInTheDocument();
    });

    it("displays inferred field count after successful inference", async () => {
      // Arrange - Inference returns 2 fields
      mockInferSchemaFromQuery.mockResolvedValue(mockInferredFields);

      // Act
      renderComponent();

      // Assert
      await waitFor(() => {
        expect(
          screen.getByText("Schema inferred from query (2 fields)"),
        ).toBeInTheDocument();
      });
    });

    it("displays warning message when schema inference fails", async () => {
      // Arrange - Inference throws - must reset and reconfigure
      mockInferSchemaFromQuery.mockReset();
      mockInferSchemaFromQuery.mockRejectedValue(new Error("Parse error"));

      // Act
      renderComponent();

      // Assert
      await waitFor(() => {
        expect(
          screen.getByText(
            "Could not infer schema from query. Define fields manually.",
          ),
        ).toBeInTheDocument();
      });
    });
  });

  describe("back navigation", () => {
    it("calls onBack when back button is clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      renderComponent();

      // Wait for loading to complete
      await waitFor(() => {
        expect(
          screen.getByText(/schema inferred from query/i),
        ).toBeInTheDocument();
      });

      // Act
      await user.click(
        screen.getByRole("button", { name: /back to selection/i }),
      );

      // Assert
      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("data extension creation", () => {
    it("displays success state with checkmark after creation", async () => {
      // Arrange
      const user = userEvent.setup();
      const { createDataExtension } = await import("@/services/metadata");
      vi.mocked(createDataExtension).mockResolvedValue({
        objectId: "new-de-id-123",
      });

      renderComponent();

      // Wait for loading to complete
      await waitFor(() => {
        expect(
          screen.getByText(/schema inferred from query/i),
        ).toBeInTheDocument();
      });

      // Fill required fields
      const customerKeyInput = screen.getByLabelText(/customer key/i);
      await user.type(customerKeyInput, "my_new_de_key");

      // Select folder
      const folderPicker = screen.getByRole("combobox", { name: /folder/i });
      await user.click(folderPicker);
      await user.click(screen.getByRole("button", { name: "Data Extensions" }));

      // Act - Submit the form
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert - Success state shows
      await waitFor(() => {
        expect(screen.getByText("Data Extension Created")).toBeInTheDocument();
      });
      expect(screen.getByText("Selecting as target...")).toBeInTheDocument();
    });

    it("calls createDataExtension API with correct DTO structure", async () => {
      // Arrange
      const user = userEvent.setup();
      const { createDataExtension } = await import("@/services/metadata");
      vi.mocked(createDataExtension).mockResolvedValue({
        objectId: "new-de-id-123",
      });

      renderComponent();

      // Wait for loading to complete
      await waitFor(() => {
        expect(
          screen.getByText(/schema inferred from query/i),
        ).toBeInTheDocument();
      });

      // Fill required fields
      const customerKeyInput = screen.getByLabelText(/customer key/i);
      await user.type(customerKeyInput, "my_new_de_key");

      // Select folder
      const folderPicker = screen.getByRole("combobox", { name: /folder/i });
      await user.click(folderPicker);
      await user.click(screen.getByRole("button", { name: "Data Extensions" }));

      // Act - Submit the form
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert
      await waitFor(() => {
        expect(createDataExtension).toHaveBeenCalledTimes(1);
      });

      expect(createDataExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          customerKey: "my_new_de_key",
          folderId: "123",
          isSendable: false,
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "SubscriberKey",
              type: "Text",
            }),
            expect.objectContaining({
              name: "EmailAddress",
              type: "EmailAddress",
            }),
          ]),
        }),
      );
    });

    it("seeds queryClient cache with new DE for immediate selection", async () => {
      // Arrange
      const user = userEvent.setup();
      const { createDataExtension } = await import("@/services/metadata");
      vi.mocked(createDataExtension).mockResolvedValue({
        objectId: "new-de-id-123",
      });

      renderComponent({ tenantId: "tenant-123", eid: "eid-456" });

      // Wait for loading to complete
      await waitFor(() => {
        expect(
          screen.getByText(/schema inferred from query/i),
        ).toBeInTheDocument();
      });

      // Fill required fields
      const customerKeyInput = screen.getByLabelText(/customer key/i);
      await user.type(customerKeyInput, "my_new_de_key");

      // Select folder
      const folderPicker = screen.getByRole("combobox", { name: /folder/i });
      await user.click(folderPicker);
      await user.click(screen.getByRole("button", { name: "Data Extensions" }));

      // Act - Submit the form
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert - Wait for creation to complete
      await waitFor(() => {
        expect(screen.getByText("Data Extension Created")).toBeInTheDocument();
      });

      // Verify DE was added to cache
      const cachedDEs = queryClient.getQueryData<DataExtension[]>(
        metadataQueryKeys.dataExtensions("tenant-123", "eid-456"),
      );
      expect(cachedDEs).toBeDefined();
      expect(cachedDEs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "my_new_de_key",
            customerKey: "my_new_de_key",
          }),
        ]),
      );

      // Verify fields cache was seeded
      const cachedFields = queryClient.getQueryData<DataExtensionField[]>(
        metadataQueryKeys.fields("tenant-123", "my_new_de_key"),
      );
      expect(cachedFields).toBeDefined();
      expect(cachedFields).toHaveLength(2);
    });

    it("calls onCreated callback with new DE object after creation", async () => {
      // Arrange
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { createDataExtension } = await import("@/services/metadata");
      vi.mocked(createDataExtension).mockResolvedValue({
        objectId: "new-de-id-123",
      });

      renderComponent();

      // Wait for loading to complete
      await waitFor(() => {
        expect(
          screen.getByText(/schema inferred from query/i),
        ).toBeInTheDocument();
      });

      // Fill required fields
      const customerKeyInput = screen.getByLabelText(/customer key/i);
      await user.type(customerKeyInput, "my_new_de_key");

      // Select folder
      const folderPicker = screen.getByRole("combobox", { name: /folder/i });
      await user.click(folderPicker);
      await user.click(screen.getByRole("button", { name: "Data Extensions" }));

      // Act - Submit the form
      await user.click(
        screen.getByRole("button", { name: /create data extension/i }),
      );

      // Assert - Wait for success state
      await waitFor(() => {
        expect(screen.getByText("Data Extension Created")).toBeInTheDocument();
      });

      // Advance timer to trigger onCreated callback (1000ms delay in component)
      vi.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(mockOnCreated).toHaveBeenCalledTimes(1);
      });

      expect(mockOnCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "my_new_de_key",
          customerKey: "my_new_de_key",
        }),
      );

      vi.useRealTimers();
    });
  });

  describe("form integration", () => {
    it("pre-populates inferred fields in the form", async () => {
      // Arrange
      renderComponent();

      // Wait for loading to complete
      await waitFor(() => {
        expect(
          screen.getByText(/schema inferred from query/i),
        ).toBeInTheDocument();
      });

      // Assert - Field names from inference should be visible
      const fieldInputs = screen.getAllByPlaceholderText("Field name");
      expect(fieldInputs).toHaveLength(2);
      expect(fieldInputs[0]).toHaveValue("SubscriberKey");
      expect(fieldInputs[1]).toHaveValue("EmailAddress");
    });

    it("allows editing inferred fields before creation", async () => {
      // Arrange
      const user = userEvent.setup();
      renderComponent();

      // Wait for loading to complete
      await waitFor(() => {
        expect(
          screen.getByText(/schema inferred from query/i),
        ).toBeInTheDocument();
      });

      // Act - Edit the first field name
      const fieldInputs = screen.getAllByPlaceholderText("Field name");
      const firstField = fieldInputs[0] as HTMLElement;
      await user.clear(firstField);
      await user.type(firstField, "ModifiedField");

      // Assert
      expect(firstField).toHaveValue("ModifiedField");
    });
  });
});
