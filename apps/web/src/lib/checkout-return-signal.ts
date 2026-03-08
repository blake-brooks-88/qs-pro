export const CHECKOUT_RETURN_SIGNAL_EVENT = "qpp:checkout-return";
export const CHECKOUT_RETURN_SIGNAL_STORAGE_KEY = "qpp:checkout-return-signal";

export type CheckoutReturnSignalStatus =
  | "success"
  | "canceled"
  | "expired"
  | "unpaid"
  | "timeout"
  | "failed";

export interface CheckoutReturnSignal {
  status: CheckoutReturnSignalStatus;
  emittedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCheckoutReturnSignalStatus(
  value: unknown,
): value is CheckoutReturnSignalStatus {
  return (
    value === "success" ||
    value === "canceled" ||
    value === "expired" ||
    value === "unpaid" ||
    value === "timeout" ||
    value === "failed"
  );
}

export function broadcastCheckoutReturnSignal(
  status: CheckoutReturnSignalStatus,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const signal: CheckoutReturnSignal = {
    status,
    emittedAt: Date.now(),
  };

  try {
    window.opener?.postMessage(
      {
        type: CHECKOUT_RETURN_SIGNAL_EVENT,
        payload: signal,
      },
      window.location.origin,
    );
  } catch {
    // Ignore cross-window messaging failures; storage fallback still runs.
  }

  try {
    const serialized = JSON.stringify(signal);
    window.localStorage.setItem(CHECKOUT_RETURN_SIGNAL_STORAGE_KEY, serialized);
    window.localStorage.removeItem(CHECKOUT_RETURN_SIGNAL_STORAGE_KEY);
  } catch {
    // Ignore storage failures in restricted browsing contexts.
  }
}

export function parseCheckoutReturnSignal(
  value: string | null,
): CheckoutReturnSignal | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      isRecord(parsed) &&
      isCheckoutReturnSignalStatus(parsed.status) &&
      typeof parsed.emittedAt === "number"
    ) {
      return {
        status: parsed.status,
        emittedAt: parsed.emittedAt,
      };
    }
  } catch {
    // Ignore malformed cross-tab signals.
  }

  return null;
}

export function isCheckoutReturnSignalMessage(data: unknown): data is {
  type: typeof CHECKOUT_RETURN_SIGNAL_EVENT;
  payload: CheckoutReturnSignal;
} {
  if (!isRecord(data) || data.type !== CHECKOUT_RETURN_SIGNAL_EVENT) {
    return false;
  }

  const payload = data.payload;
  return (
    isRecord(payload) &&
    isCheckoutReturnSignalStatus(payload.status) &&
    typeof payload.emittedAt === "number"
  );
}
