import { create } from "zustand";

interface VersionHistoryState {
  isOpen: boolean;
  savedQueryId: string | null;
  selectedVersionId: string | null;
  showChanges: boolean;
  openVersionHistory: (savedQueryId: string) => void;
  closeVersionHistory: () => void;
  selectVersion: (versionId: string | null) => void;
  toggleShowChanges: () => void;
}

export const useVersionHistoryStore = create<VersionHistoryState>((set) => ({
  isOpen: false,
  savedQueryId: null,
  selectedVersionId: null,
  showChanges: true,
  openVersionHistory: (savedQueryId) => {
    if (typeof savedQueryId !== "string") {
      return;
    }
    set({
      isOpen: true,
      savedQueryId,
      selectedVersionId: null,
      showChanges: true,
    });
  },
  closeVersionHistory: () =>
    set({
      isOpen: false,
      savedQueryId: null,
      selectedVersionId: null,
    }),
  selectVersion: (versionId) => set({ selectedVersionId: versionId }),
  toggleShowChanges: () =>
    set((state) => ({ showChanges: !state.showChanges })),
}));
