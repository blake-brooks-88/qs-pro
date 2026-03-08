import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEidLookup } from "@/features/tenants/hooks/use-tenants";

interface EidLookupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_VARIANT_MAP: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  trialing: "warning",
  past_due: "destructive",
  canceled: "destructive",
  inactive: "secondary",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function EidLookupDialog({ open, onOpenChange }: EidLookupDialogProps) {
  const [eid, setEid] = useState("");
  const navigate = useNavigate();
  const { data, refetch, isFetching, isError, fetchStatus } = useEidLookup(eid.trim());
  const hasSearched = fetchStatus !== "idle" || data !== undefined || isError;

  const handleLookup = () => {
    if (eid.trim()) {
      void refetch();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLookup();
    }
  };

  const handleViewDetails = () => {
    onOpenChange(false);
    void navigate(`/tenants?search=${encodeURIComponent(eid.trim())}`);
  };

  const handleCreateInvoice = () => {
    onOpenChange(false);
    void navigate(`/invoicing/create?eid=${encodeURIComponent(eid.trim())}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>EID Lookup</DialogTitle>
          <DialogDescription>
            Look up a tenant by their Enterprise ID.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={eid}
            onChange={(e) => { setEid(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder="Enter EID..."
            className="flex-1"
          />
          <Button
            onClick={handleLookup}
            disabled={!eid.trim() || isFetching}
            size="sm"
          >
            {isFetching ? "Looking up..." : "Lookup"}
          </Button>
        </div>

        {data ? (
          <div className="rounded-md border border-border/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-foreground">{data.companyName}</h4>
              <Badge variant={STATUS_VARIANT_MAP[data.subscriptionStatus] ?? "secondary"}>
                {capitalize(data.subscriptionStatus)}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">EID:</span> {data.eid}
              </div>
              <div>
                <span className="font-medium text-foreground">Tier:</span> {capitalize(data.tier)}
              </div>
              <div>
                <span className="font-medium text-foreground">Users:</span> {data.userCount}
              </div>
              <div>
                <span className="font-medium text-foreground">Signup:</span>{" "}
                {data.signupDate
                  ? new Date(data.signupDate).toLocaleDateString()
                  : "-"}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={handleViewDetails}>
                View Details
              </Button>
              <Button size="sm" variant="outline" onClick={handleCreateInvoice}>
                Create Invoice
              </Button>
            </div>
          </div>
        ) : null}

        {isError && hasSearched && !isFetching ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No tenant found for EID <span className="font-mono">{eid.trim()}</span>
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export { EidLookupDialog };
