import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { InvoiceListItem } from "../hooks/use-invoicing";
import { InvoiceTable } from "./InvoiceTable";

const sampleInvoices: InvoiceListItem[] = [
  {
    tenantEid: "12345678",
    tenantName: "Acme Corp",
    amount: 9900,
    status: "paid",
    date: "2026-03-01T00:00:00Z",
    dueDate: "2026-03-15T00:00:00Z",
    hostedUrl: "https://invoice.stripe.com/i/paid123",
  },
  {
    tenantEid: "87654321",
    tenantName: "Beta Inc",
    amount: 19900,
    status: "sent",
    date: "2026-03-05T00:00:00Z",
    dueDate: "2026-04-04T00:00:00Z",
    hostedUrl: null,
  },
  {
    tenantEid: "11111111",
    tenantName: "Overdue LLC",
    amount: 4900,
    status: "overdue",
    date: "2026-02-01T00:00:00Z",
    dueDate: "2026-02-15T00:00:00Z",
    hostedUrl: "https://invoice.stripe.com/i/overdue456",
  },
];

describe("InvoiceTable", () => {
  it("should render invoice rows with status badges", () => {
    render(<InvoiceTable invoices={sampleInvoices} />);

    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Beta Inc")).toBeInTheDocument();
    expect(screen.getByText("Overdue LLC")).toBeInTheDocument();

    const paidBadge = screen.getByText("Paid");
    expect(paidBadge).toHaveClass("text-emerald-500");

    const sentBadge = screen.getByText("Sent");
    expect(sentBadge).toHaveClass("text-primary-foreground");

    const overdueBadge = screen.getByText("Overdue");
    expect(overdueBadge).toHaveClass("text-destructive");
  });

  it("should show 'Pending' for null invoice URLs", () => {
    render(<InvoiceTable invoices={sampleInvoices} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("should show clickable link for available invoice URLs", () => {
    render(<InvoiceTable invoices={sampleInvoices} />);
    const links = screen.getAllByText("View");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://invoice.stripe.com/i/paid123");
    expect(links[0]).toHaveAttribute("target", "_blank");
  });
});
