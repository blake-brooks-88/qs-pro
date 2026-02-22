const PRICING_PAGE_BASE = "https://queryplusplus.com/pricing";

export const PRICING_PAGE_URL = PRICING_PAGE_BASE;

/**
 * Build pricing page URL with an opaque encrypted token.
 * The external pricing page passes this token to Stripe Checkout metadata.
 * The webhook handler decrypts it to resolve the tenant EID.
 */
export function buildPricingUrl(token: string): string {
  const url = new URL(PRICING_PAGE_BASE);
  url.searchParams.set("eid", token);
  return url.toString();
}
