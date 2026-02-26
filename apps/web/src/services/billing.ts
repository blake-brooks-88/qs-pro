import api from "@/services/api";

export async function createCheckout(
  tier: "pro",
  interval: "monthly" | "annual",
): Promise<{ url: string }> {
  const { data } = await api.post<{ url: string }>("/billing/checkout", {
    tier,
    interval,
  });
  return data;
}

export async function createPortalSession(): Promise<{ url: string }> {
  const { data } = await api.post<{ url: string }>("/billing/portal");
  return data;
}
