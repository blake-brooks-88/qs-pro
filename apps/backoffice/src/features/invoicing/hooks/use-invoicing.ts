import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface CreateInvoicedSubscriptionParams {
  tenantEid: string;
  tier: "pro" | "enterprise";
  interval: "monthly" | "annual";
  seatCount: number;
  paymentTerms: "net_15" | "net_30" | "net_60";
  customerEmail: string;
  customerName: string;
  companyName: string;
  couponId?: string;
}

export interface InvoicedSubscriptionResult {
  invoiceUrl: string | null;
  subscriptionId: string;
  invoiceStatus: string;
  amount: number;
  dueDate: string | null;
  stripeInvoiceId: string | null;
}

export interface InvoiceListItem {
  tenantEid: string | null;
  tenantName: string | null;
  amount: number;
  status: string;
  date: string | null;
  dueDate: string | null;
  hostedUrl: string | null;
}

export interface PaginatedInvoiceList {
  invoices: InvoiceListItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function useCreateInvoicedSubscription() {
  const queryClient = useQueryClient();
  return useMutation<InvoicedSubscriptionResult, Error, CreateInvoicedSubscriptionParams>({
    mutationFn: async (params) => {
      const { data } = await api.post<InvoicedSubscriptionResult>(
        "/api/invoicing/subscriptions",
        params,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useInvoices(options?: { tenantId?: string }) {
  const tenantId = options?.tenantId;

  return useQuery<PaginatedInvoiceList>({
    queryKey: ["invoices", { tenantId: tenantId ?? null }],
    queryFn: async () => {
      if (tenantId) {
        const { data } = await api.get<PaginatedInvoiceList>(
          `/api/invoicing/tenants/${tenantId}/invoices`,
        );
        return data;
      }
      const { data } = await api.get<PaginatedInvoiceList>(
        "/api/invoicing/invoices",
      );
      return data;
    },
  });
}

export function useEidLookup(eid: string) {
  return useQuery({
    queryKey: ["tenants", "lookup", eid],
    queryFn: async () => {
      const { data } = await api.get<{
        eid: string;
        companyName: string;
        userCount: number;
        tier: string;
        subscriptionStatus: string;
        signupDate: string | null;
      }>(`/tenants/lookup/${eid}`);
      return data;
    },
    enabled: false,
  });
}
