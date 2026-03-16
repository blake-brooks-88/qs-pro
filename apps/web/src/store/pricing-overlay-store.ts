import { create } from "zustand";

type PricingSource =
  | "feature_gate"
  | "header"
  | "quota_limit"
  | "trial_banner"
  | "run_limit"
  | "settings_billing";

interface PricingOverlayState {
  isOpen: boolean;
  source: PricingSource | null;
  open: (source?: PricingSource) => void;
  close: () => void;
}

export const usePricingOverlayStore = create<PricingOverlayState>((set) => ({
  isOpen: false,
  source: null,
  open: (source) => set({ isOpen: true, source: source ?? null }),
  close: () => set({ isOpen: false, source: null }),
}));
