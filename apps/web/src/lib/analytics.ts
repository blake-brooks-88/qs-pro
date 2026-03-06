type AnalyticsEvent =
  | "pricing_overlay_opened"
  | "billing_interval_toggled"
  | "checkout_initiated"
  | "checkout_completed"
  | "checkout_canceled"
  | "portal_opened"
  | "enterprise_contact_clicked";

export function track(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): void {
  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    return;
  }

  void { event, properties };
}
