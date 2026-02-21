const PRICING_PAGE_BASE = "https://queryplusplus.com/pricing";

export const PRICING_PAGE_URL = PRICING_PAGE_BASE;

/**
 * Build pricing page URL with tenant eid for Stripe Checkout identification.
 * The external pricing page embeds this eid in Stripe session metadata,
 * which the webhook handler uses to resolve the tenant after payment.
 */
export function buildPricingUrl(eid: string): string {
  const url = new URL(PRICING_PAGE_BASE);
  url.searchParams.set("eid", eid);
  return url.toString();
}
