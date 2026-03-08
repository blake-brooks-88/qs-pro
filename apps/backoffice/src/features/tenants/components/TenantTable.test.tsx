import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { TenantTable, type TenantListItem } from "./TenantTable";

const sampleTenants: TenantListItem[] = [
  {
    tenantId: "t-001",
    eid: "12345678",
    companyName: "Acme Corp",
    tier: "pro",
    subscriptionStatus: "active",
    userCount: 5,
    signupDate: "2025-06-15T00:00:00Z",
    lastActiveDate: "2026-03-07T12:00:00Z",
  },
  {
    tenantId: "t-002",
    eid: "87654321",
    companyName: "Enterprise Ltd",
    tier: "enterprise",
    subscriptionStatus: "trialing",
    userCount: 12,
    signupDate: "2026-01-10T00:00:00Z",
    lastActiveDate: "2026-03-08T09:00:00Z",
  },
  {
    tenantId: "t-003",
    eid: "11111111",
    companyName: "Startup Inc",
    tier: "free",
    subscriptionStatus: "canceled",
    userCount: 1,
    signupDate: "2025-12-01T00:00:00Z",
    lastActiveDate: null,
  },
  {
    tenantId: "t-004",
    eid: "22222222",
    companyName: "Overdue Co",
    tier: "pro",
    subscriptionStatus: "past_due",
    userCount: 3,
    signupDate: "2025-09-01T00:00:00Z",
    lastActiveDate: "2026-02-15T00:00:00Z",
  },
];

function renderTable(props: Partial<Parameters<typeof TenantTable>[0]> = {}) {
  return render(
    <MemoryRouter>
      <TenantTable
        data={sampleTenants}
        isLoading={false}
        pageCount={1}
        totalItems={sampleTenants.length}
        pagination={{ pageIndex: 0, pageSize: 25 }}
        onPaginationChange={vi.fn()}
        sorting={[]}
        onSortingChange={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("TenantTable", () => {
  it("should render tenant rows with correct columns", () => {
    renderTable();

    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("12345678")).toBeInTheDocument();
    expect(screen.getByText("Enterprise Ltd")).toBeInTheDocument();
    expect(screen.getByText("87654321")).toBeInTheDocument();
  });

  it("should render tier badges with correct variants", () => {
    renderTable();

    const proBadge = screen.getAllByText("Pro")[0];
    expect(proBadge).toBeInTheDocument();

    const enterpriseBadge = screen.getByText("Enterprise");
    expect(enterpriseBadge).toBeInTheDocument();

    const freeBadge = screen.getByText("Free");
    expect(freeBadge).toBeInTheDocument();
  });

  it("should render status badges with correct colors", () => {
    renderTable();

    const activeBadge = screen.getByText("Active");
    expect(activeBadge).toHaveClass("text-emerald-500");

    const trialingBadge = screen.getByText("Trialing");
    expect(trialingBadge).toHaveClass("text-amber-500");

    const canceledBadge = screen.getByText("Canceled");
    expect(canceledBadge).toHaveClass("text-destructive");

    const pastDueBadge = screen.getByText("Past Due");
    expect(pastDueBadge).toHaveClass("text-destructive");
  });

  it("should show empty state when no data", () => {
    renderTable({ data: [] });

    expect(screen.getByText("No tenants found.")).toBeInTheDocument();
  });

  it("should render rows as clickable links to tenant detail", () => {
    renderTable();

    const rows = screen.getAllByRole("link");
    const firstRow = rows[0];
    expect(firstRow).toHaveAttribute("href", "/tenants/t-001");
  });
});
