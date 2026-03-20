import { create } from "zustand";

function makeDismissalKey(
  sourceDE: string,
  sourceCol: string,
  targetDE: string,
  targetCol: string,
): string {
  const a = `${sourceDE}:${sourceCol}`;
  const b = `${targetDE}:${targetCol}`;
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

interface PendingSave {
  sourceDE: string;
  sourceColumn: string;
  targetDE: string;
  targetColumn: string;
}

interface RelationshipStoreState {
  sessionDismissals: Set<string>;
  configDEConfirmed: boolean;
  showFirstSaveDialog: boolean;
  pendingSave: PendingSave | null;

  dismissForSession: (
    sourceDE: string,
    sourceCol: string,
    targetDE: string,
    targetCol: string,
  ) => void;
  isDismissedForSession: (
    sourceDE: string,
    sourceCol: string,
    targetDE: string,
    targetCol: string,
  ) => boolean;
  setConfigDEConfirmed: (confirmed: boolean) => void;
  openFirstSaveDialog: (pending: PendingSave) => void;
  closeFirstSaveDialog: () => void;
}

export const useRelationshipStore = create<RelationshipStoreState>(
  (set, get) => ({
    sessionDismissals: new Set(),
    configDEConfirmed: false,
    showFirstSaveDialog: false,
    pendingSave: null,

    dismissForSession: (sourceDE, sourceCol, targetDE, targetCol) => {
      const key = makeDismissalKey(sourceDE, sourceCol, targetDE, targetCol);
      const next = new Set(get().sessionDismissals);
      next.add(key);
      set({ sessionDismissals: next });
    },

    isDismissedForSession: (sourceDE, sourceCol, targetDE, targetCol) => {
      const key = makeDismissalKey(sourceDE, sourceCol, targetDE, targetCol);
      return get().sessionDismissals.has(key);
    },

    setConfigDEConfirmed: (confirmed) => set({ configDEConfirmed: confirmed }),

    openFirstSaveDialog: (pending) =>
      set({ showFirstSaveDialog: true, pendingSave: pending }),

    closeFirstSaveDialog: () =>
      set({ showFirstSaveDialog: false, pendingSave: null }),
  }),
);
