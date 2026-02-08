import type { ColumnDef } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./DataTable";

interface TestRow {
  id: number;
  name: string;
}

const testColumns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
];

const testData: TestRow[] = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Charlie" },
];

describe("DataTable", () => {
  it("should render column headers and rows", () => {
    render(<DataTable columns={testColumns} data={testData} />);

    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("should render empty message when data is empty", () => {
    render(<DataTable columns={testColumns} data={[]} />);

    expect(screen.getByText("No results found.")).toBeInTheDocument();
  });

  it("should render custom empty message", () => {
    render(
      <DataTable columns={testColumns} data={[]} emptyMessage="Nothing here" />,
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("should not render data rows or empty message when loading", () => {
    render(<DataTable columns={testColumns} data={testData} isLoading />);

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.queryByText("No results found.")).not.toBeInTheDocument();
  });

  it("should render pagination when server-side mode is enabled", () => {
    const onPaginationChange = vi.fn();

    render(
      <DataTable
        columns={testColumns}
        data={testData}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        onPaginationChange={onPaginationChange}
        pageCount={5}
        totalItems={50}
      />,
    );

    expect(screen.getByLabelText("Go to next page")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to previous page")).toBeInTheDocument();
  });

  it("should not render pagination in client-side mode", () => {
    render(<DataTable columns={testColumns} data={testData} />);

    expect(screen.queryByLabelText("Go to next page")).not.toBeInTheDocument();
  });
});
