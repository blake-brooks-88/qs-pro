import { create } from "zustand";

export type ActivityView = "dataExtensions" | "queries" | "history";

interface ActivityBarState {
  activeView: ActivityView | null;
  setActiveView: (view: ActivityView | null) => void;
  toggleView: (view: ActivityView) => void;
}

export const useActivityBarStore = create<ActivityBarState>((set, get) => ({
  activeView: "dataExtensions",
  setActiveView: (view) => set({ activeView: view }),
  toggleView: (view) =>
    set({ activeView: get().activeView === view ? null : view }),
}));
