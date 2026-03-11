import { z } from "zod";

export const CreateInvoicedSubscriptionSchema = z.object({
  tenantEid: z.string().min(1),
  tier: z.enum(["pro", "enterprise"]),
  interval: z.enum(["monthly", "annual"]),
  seatCount: z.number().int().min(1).max(1000),
  paymentTerms: z.enum(["net_15", "net_30", "net_60"]).default("net_30"),
  customerEmail: z.string().email(),
  customerName: z.string().min(1),
  companyName: z.string().min(1),
  couponId: z.string().optional(),
});

export type CreateInvoicedSubscriptionDto = z.infer<
  typeof CreateInvoicedSubscriptionSchema
>;

export const PAYMENT_TERMS_DAYS = {
  net_15: 15,
  net_30: 30,
  net_60: 60,
} as const;

export interface InvoicedSubscriptionResultDto {
  invoiceUrl: string | null;
  subscriptionId: string;
  invoiceStatus: string;
  amount: number;
  dueDate: string | null;
  stripeInvoiceId: string | null;
}

export const ListInvoicesQuerySchema = z.object({
  limit: z.coerce.number().pipe(z.number().int().min(1).max(100).default(25)),
  offset: z.coerce.number().int().min(0).default(0),
  tenantId: z.string().uuid().optional(),
});

export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>;

export interface InvoiceListItemDto {
  tenantEid: string | null;
  tenantName: string | null;
  amount: number;
  status: string;
  date: string | null;
  dueDate: string | null;
  hostedUrl: string | null;
}

export interface PaginatedInvoiceList {
  invoices: InvoiceListItemDto[];
  hasMore: boolean;
  nextCursor: string | null;
}
