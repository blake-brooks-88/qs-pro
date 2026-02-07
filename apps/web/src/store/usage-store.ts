import { create } from "zustand";

interface UsageStoreState {
  isWarningBannerDismissed: boolean;
  dismissWarningBanner: () => void;
}

export const useUsageStore = create<UsageStoreState>((set) => ({
  isWarningBannerDismissed: false,
  dismissWarningBanner: () => set({ isWarningBannerDismissed: true }),
}));
