import { create } from "zustand";

export type ActivityView = "dataExtensions" | "queries" | "history";

interface ActivityBarState {
  activeView: ActivityView | null;
  historyQueryIdFilter: string | undefined;
  setActiveView: (view: ActivityView | null) => void;
  toggleView: (view: ActivityView) => void;
  showHistoryForQuery: (queryId: string) => void;
  clearHistoryFilter: () => void;
}

export const useActivityBarStore = create<ActivityBarState>((set, get) => ({
  activeView: "dataExtensions",
  historyQueryIdFilter: undefined,
  setActiveView: (view) =>
    set({
      activeView: view,
      historyQueryIdFilter:
        view === "history" ? get().historyQueryIdFilter : undefined,
    }),
  toggleView: (view) =>
    set({
      activeView: get().activeView === view ? null : view,
      historyQueryIdFilter:
        view === "history" ? get().historyQueryIdFilter : undefined,
    }),
  showHistoryForQuery: (queryId) =>
    set({ activeView: "history", historyQueryIdFilter: queryId }),
  clearHistoryFilter: () => set({ historyQueryIdFilter: undefined }),
}));
