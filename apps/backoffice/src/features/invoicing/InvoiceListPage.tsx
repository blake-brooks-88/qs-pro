import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";

import { InvoiceTable } from "./components/InvoiceTable";
import { useInvoices } from "./hooks/use-invoicing";

function InvoiceListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const { data, isLoading } = useInvoices();

  const invoices = data?.invoices ?? [];
  const hasMore = data?.hasMore ?? false;
  const nextCursor = data?.nextCursor ?? null;

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Invoices
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Refresh
          </Button>
          {canEdit ? (
            <Button
              size="sm"
              onClick={() => { void navigate("/invoicing/create"); }}
            >
              Create Invoice
            </Button>
          ) : null}
        </div>
      </div>

      <InvoiceTable invoices={invoices} isLoading={isLoading} />

      {hasMore && nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" disabled>
            Load More
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export { InvoiceListPage };
