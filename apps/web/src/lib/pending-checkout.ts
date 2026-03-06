const PENDING_CHECKOUT_UNTIL_KEY = "pendingCheckoutPollUntil";
const PENDING_CHECKOUT_CHANGED_EVENT = "qpp:pending-checkout-changed";
const DEFAULT_PENDING_CHECKOUT_TTL_MS = 30 * 60 * 1000;

function dispatchPendingCheckoutChanged(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(PENDING_CHECKOUT_CHANGED_EVENT));
}

export function markPendingCheckout(
  ttlMs: number = DEFAULT_PENDING_CHECKOUT_TTL_MS,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    PENDING_CHECKOUT_UNTIL_KEY,
    String(Date.now() + ttlMs),
  );
  dispatchPendingCheckoutChanged();
}

export function clearPendingCheckout(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(PENDING_CHECKOUT_UNTIL_KEY);
  dispatchPendingCheckoutChanged();
}

export function hasPendingCheckout(now: number = Date.now()): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const raw = window.sessionStorage.getItem(PENDING_CHECKOUT_UNTIL_KEY);
  if (!raw) {
    return false;
  }

  const expiresAt = Number(raw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    window.sessionStorage.removeItem(PENDING_CHECKOUT_UNTIL_KEY);
    return false;
  }

  return true;
}

export { PENDING_CHECKOUT_CHANGED_EVENT };
