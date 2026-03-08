import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import {
  useCreateInvoicedSubscription,
  useEidLookup,
  type InvoicedSubscriptionResult,
} from "../hooks/use-invoicing";
import { InvoiceResultCard } from "./InvoiceResultCard";

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

interface FormState {
  tier: "pro" | "enterprise";
  interval: "monthly" | "annual";
  seatCount: string;
  paymentTerms: "net_15" | "net_30" | "net_60";
  couponId: string;
  customerEmail: string;
  customerName: string;
  companyName: string;
}

const INITIAL_FORM: FormState = {
  tier: "pro",
  interval: "monthly",
  seatCount: "1",
  paymentTerms: "net_30",
  couponId: "",
  customerEmail: "",
  customerName: "",
  companyName: "",
};

function InvoiceForm() {
  const [searchParams] = useSearchParams();
  const initialEid = searchParams.get("eid") ?? "";

  const [eid, setEid] = useState(initialEid);
  const [tenantConfirmed, setTenantConfirmed] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [result, setResult] = useState<InvoicedSubscriptionResult | null>(null);

  const eidLookup = useEidLookup(eid.trim());
  const createMutation = useCreateInvoicedSubscription();

  const handleLookup = useCallback(() => {
    if (eid.trim()) {
      setTenantConfirmed(false);
      void eidLookup.refetch();
    }
  }, [eid, eidLookup]);

  const handleConfirm = useCallback(() => {
    if (eidLookup.data) {
      setTenantConfirmed(true);
      setForm((prev) => ({
        ...prev,
        companyName: eidLookup.data!.companyName,
      }));
    }
  }, [eidLookup.data]);

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    },
    [],
  );

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};

    if (!form.customerEmail.trim()) {
      newErrors.customerEmail = "Customer email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail)) {
      newErrors.customerEmail = "Invalid email address";
    }
    if (!form.customerName.trim()) {
      newErrors.customerName = "Customer name is required";
    }
    if (!form.companyName.trim()) {
      newErrors.companyName = "Company name is required";
    }
    const seats = parseInt(form.seatCount, 10);
    if (isNaN(seats) || seats < 1 || seats > 1000) {
      newErrors.seatCount = "Seat count must be between 1 and 1000";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      createMutation.mutate(
        {
          tenantEid: eid.trim(),
          tier: form.tier,
          interval: form.interval,
          seatCount: parseInt(form.seatCount, 10),
          paymentTerms: form.paymentTerms,
          customerEmail: form.customerEmail.trim(),
          customerName: form.customerName.trim(),
          companyName: form.companyName.trim(),
          couponId: form.couponId.trim() || undefined,
        },
        {
          onSuccess: (data) => {
            setResult(data);
          },
          onError: (error) => {
            toast.error(error.message || "Failed to create invoiced subscription");
          },
        },
      );
    },
    [validate, createMutation, eid, form],
  );

  const handleReset = useCallback(() => {
    setResult(null);
    setEid("");
    setTenantConfirmed(false);
    setForm(INITIAL_FORM);
    setErrors({});
  }, []);

  if (result) {
    return (
      <InvoiceResultCard
        result={result}
        tenantEid={eid.trim()}
        onReset={handleReset}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 1: Tenant Identification</CardTitle>
          <CardDescription>
            Look up the tenant by their Enterprise ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="eid" className="text-sm font-medium text-foreground">
                Enterprise ID (EID)
              </label>
              <Input
                id="eid"
                value={eid}
                onChange={(e) => {
                  setEid(e.target.value);
                  setTenantConfirmed(false);
                }}
                placeholder="Enter EID..."
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleLookup}
              disabled={!eid.trim() || eidLookup.isFetching}
            >
              {eidLookup.isFetching ? "Looking up..." : "Lookup"}
            </Button>
          </div>

          {eidLookup.data && !tenantConfirmed ? (
            <div className="rounded-md border border-border/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-foreground">
                  {eidLookup.data.companyName}
                </h4>
                <Badge
                  variant={
                    STATUS_VARIANT_MAP[eidLookup.data.subscriptionStatus] ?? "secondary"
                  }
                >
                  {capitalize(eidLookup.data.subscriptionStatus)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Tier:</span>{" "}
                  {capitalize(eidLookup.data.tier)}
                </div>
                <div>
                  <span className="font-medium text-foreground">Users:</span>{" "}
                  {eidLookup.data.userCount}
                </div>
              </div>
              <Button type="button" size="sm" onClick={handleConfirm}>
                Confirm
              </Button>
            </div>
          ) : null}

          {tenantConfirmed ? (
            <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-emerald-500">
              Tenant confirmed: {eidLookup.data?.companyName}
            </div>
          ) : null}

          {eidLookup.isError && !eidLookup.isFetching ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-center text-sm text-muted-foreground">
              No tenant found for EID{" "}
              <span className="font-mono">{eid.trim()}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 2: Subscription Details</CardTitle>
          <CardDescription>
            Configure the subscription tier and billing details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tier" className="text-sm font-medium text-foreground">
                Tier
              </label>
              <Select
                id="tier"
                value={form.tier}
                onChange={(e) => {
                  updateField("tier", e.target.value as "pro" | "enterprise");
                }}
                disabled={!tenantConfirmed}
              >
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">
                Billing Interval
              </label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="interval"
                    value="monthly"
                    checked={form.interval === "monthly"}
                    onChange={() => { updateField("interval", "monthly"); }}
                    disabled={!tenantConfirmed}
                    className="accent-primary"
                  />
                  Monthly
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="interval"
                    value="annual"
                    checked={form.interval === "annual"}
                    onChange={() => { updateField("interval", "annual"); }}
                    disabled={!tenantConfirmed}
                    className="accent-primary"
                  />
                  Annual
                </label>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="seatCount" className="text-sm font-medium text-foreground">
                Seat Count
              </label>
              <Input
                id="seatCount"
                type="number"
                min={1}
                max={1000}
                value={form.seatCount}
                onChange={(e) => { updateField("seatCount", e.target.value); }}
                disabled={!tenantConfirmed}
              />
              {errors.seatCount ? (
                <p className="mt-1 text-xs text-destructive">{errors.seatCount}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="paymentTerms" className="text-sm font-medium text-foreground">
                Payment Terms
              </label>
              <Select
                id="paymentTerms"
                value={form.paymentTerms}
                onChange={(e) => {
                  updateField("paymentTerms", e.target.value as "net_15" | "net_30" | "net_60");
                }}
                disabled={!tenantConfirmed}
              >
                <option value="net_15">Net 15</option>
                <option value="net_30">Net 30</option>
                <option value="net_60">Net 60</option>
              </Select>
            </div>
            <div>
              <label htmlFor="couponId" className="text-sm font-medium text-foreground">
                Discount Coupon (optional)
              </label>
              <Input
                id="couponId"
                value={form.couponId}
                onChange={(e) => { updateField("couponId", e.target.value); }}
                placeholder="Stripe coupon ID"
                disabled={!tenantConfirmed}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 3: Customer Info</CardTitle>
          <CardDescription>
            Provide the billing contact details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="customerEmail" className="text-sm font-medium text-foreground">
                Customer Email
              </label>
              <Input
                id="customerEmail"
                type="email"
                value={form.customerEmail}
                onChange={(e) => { updateField("customerEmail", e.target.value); }}
                placeholder="billing@company.com"
                disabled={!tenantConfirmed}
              />
              {errors.customerEmail ? (
                <p className="mt-1 text-xs text-destructive">{errors.customerEmail}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="customerName" className="text-sm font-medium text-foreground">
                Customer Name
              </label>
              <Input
                id="customerName"
                value={form.customerName}
                onChange={(e) => { updateField("customerName", e.target.value); }}
                placeholder="John Doe"
                disabled={!tenantConfirmed}
              />
              {errors.customerName ? (
                <p className="mt-1 text-xs text-destructive">{errors.customerName}</p>
              ) : null}
            </div>
          </div>
          <div>
            <label htmlFor="companyName" className="text-sm font-medium text-foreground">
              Company Name
            </label>
            <Input
              id="companyName"
              value={form.companyName}
              onChange={(e) => { updateField("companyName", e.target.value); }}
              placeholder="Company Inc"
              disabled={!tenantConfirmed}
            />
            {errors.companyName ? (
              <p className="mt-1 text-xs text-destructive">{errors.companyName}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Button
        type="submit"
        disabled={!tenantConfirmed || createMutation.isPending}
        className="w-full"
      >
        {createMutation.isPending ? "Creating..." : "Create Invoiced Subscription"}
      </Button>
    </form>
  );
}

export { InvoiceForm };
