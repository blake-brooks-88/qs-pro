import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePermissions } from "@/hooks/use-permissions";

import type { InvoicedSubscriptionResult } from "../hooks/use-invoicing";

const STATUS_VARIANT_MAP: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  paid: "success",
  open: "warning",
  draft: "secondary",
  void: "secondary",
  uncollectible: "destructive",
};

interface InvoiceResultCardProps {
  result: InvoicedSubscriptionResult;
  tenantEid: string;
  onReset: () => void;
}

function InvoiceResultCard({ result, tenantEid, onReset }: InvoiceResultCardProps) {
  const navigate = useNavigate();
  const { canAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const isFetchingInvoices = useIsFetching({ queryKey: ["invoices"] });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleCopyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Copied!");
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    setIsRefreshing(false);
  };

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(result.amount / 100);

  return (
    <Card className="border-success/30 bg-success/5">
      <CardHeader>
        <CardTitle className="text-lg">Subscription Created</CardTitle>
        <CardDescription>
          The invoiced subscription has been created successfully.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Invoice URL</span>
            <div className="mt-1">
              {result.invoiceUrl ? (
                <button
                  type="button"
                  onClick={() => void handleCopyUrl(result.invoiceUrl!)}
                  className="text-primary hover:underline break-all text-left"
                >
                  {result.invoiceUrl}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground italic">
                    Invoice pending &mdash; URL will be available shortly
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRefresh()}
                    disabled={isRefreshing || isFetchingInvoices > 0}
                  >
                    {isRefreshing || isFetchingInvoices > 0 ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Status</span>
            <div className="mt-1">
              <Badge variant={STATUS_VARIANT_MAP[result.invoiceStatus] ?? "secondary"}>
                {result.invoiceStatus}
              </Badge>
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Amount</span>
            <div className="mt-1 font-medium">{formattedAmount}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Due Date</span>
            <div className="mt-1">
              {result.dueDate
                ? new Date(result.dueDate).toLocaleDateString()
                : "-"}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Subscription ID</span>
            <div className="mt-1 font-mono text-xs break-all">
              {result.subscriptionId}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Stripe Invoice ID</span>
            <div className="mt-1 font-mono text-xs break-all">
              {result.stripeInvoiceId ?? "-"}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          {canAdmin && result.subscriptionId ? (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://dashboard.stripe.com/subscriptions/${result.subscriptionId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View in Stripe
              </a>
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onReset}>
            Create Another
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigate(`/tenants?search=${encodeURIComponent(tenantEid)}`);
            }}
          >
            View Tenant
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { InvoiceResultCard };
