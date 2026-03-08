import { Badge } from "@/components/ui/badge";

import type { InvoiceListItem } from "../hooks/use-invoicing";

const STATUS_VARIANT_MAP: Record<string, "success" | "default" | "destructive" | "secondary"> = {
  paid: "success",
  sent: "default",
  open: "default",
  overdue: "destructive",
  void: "secondary",
  draft: "secondary",
  uncollectible: "destructive",
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface InvoiceTableProps {
  invoices: InvoiceListItem[];
  isLoading?: boolean;
}

function InvoiceTable({ invoices, isLoading }: InvoiceTableProps) {
  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Loading invoices...
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No invoices found.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="h-10 px-4 text-left font-medium text-muted-foreground">
              Tenant
            </th>
            <th className="h-10 px-4 text-left font-medium text-muted-foreground">
              Amount
            </th>
            <th className="h-10 px-4 text-left font-medium text-muted-foreground">
              Status
            </th>
            <th className="h-10 px-4 text-left font-medium text-muted-foreground">
              Date
            </th>
            <th className="h-10 px-4 text-left font-medium text-muted-foreground">
              Due Date
            </th>
            <th className="h-10 px-4 text-left font-medium text-muted-foreground">
              Invoice
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice, i) => (
            <tr
              key={`${invoice.tenantEid ?? "unknown"}-${invoice.date ?? i}`}
              className="border-b transition-colors hover:bg-muted/50"
            >
              <td className="h-12 px-4 font-medium">
                {invoice.tenantName ?? invoice.tenantEid ?? "-"}
              </td>
              <td className="h-12 px-4">
                {formatCurrency(invoice.amount)}
              </td>
              <td className="h-12 px-4">
                <Badge variant={STATUS_VARIANT_MAP[invoice.status] ?? "secondary"}>
                  {capitalize(invoice.status)}
                </Badge>
              </td>
              <td className="h-12 px-4 text-muted-foreground">
                {invoice.date
                  ? new Date(invoice.date).toLocaleDateString()
                  : "-"}
              </td>
              <td className="h-12 px-4 text-muted-foreground">
                {invoice.dueDate
                  ? new Date(invoice.dueDate).toLocaleDateString()
                  : "-"}
              </td>
              <td className="h-12 px-4">
                {invoice.hostedUrl ? (
                  <a
                    href={invoice.hostedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-muted-foreground italic">Pending</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { InvoiceTable };
