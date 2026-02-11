import { create } from "zustand";

export interface Tab {
  id: string;
  queryId?: string; // undefined for unsaved "Untitled" tabs
  name: string;
  content: string;
  originalContent: string; // content when opened/saved, for dirty detection
  isDirty: boolean;
  isNew: boolean; // true for Untitled tabs that haven't been saved
  linkedQaCustomerKey?: string | null;
  linkedQaName?: string | null;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  untitledCounter: number;

  // Tab operations
  createNewTab: () => string;
  openQuery: (
    queryId: string,
    name: string,
    content: string,
    linkState?: {
      linkedQaCustomerKey: string | null;
      linkedQaName: string | null;
    },
  ) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  markTabSaved: (tabId: string, queryId: string, name: string) => void;
  renameTab: (tabId: string, name: string) => void;
  updateTabLinkState: (
    tabId: string,
    linkState: {
      linkedQaCustomerKey: string | null;
      linkedQaName: string | null;
    },
  ) => void;

  // Query helpers
  findTabByQueryId: (queryId: string) => Tab | undefined;
  getActiveTab: () => Tab | undefined;
  hasDirtyTabs: () => boolean;
  getDirtyTabs: () => Tab[];

  // Reset (for testing)
  reset: () => void;
}

const initialState = {
  tabs: [] as Tab[],
  activeTabId: null as string | null,
  untitledCounter: 0,
};

export const useTabsStore = create<TabsState>((set, get) => ({
  ...initialState,

  createNewTab: () => {
    const { untitledCounter, tabs } = get();
    const newCounter = untitledCounter + 1;
    const id = `untitled-${newCounter}`;
    const newTab: Tab = {
      id,
      name: `Untitled-${newCounter}`,
      content: "",
      originalContent: "",
      isDirty: false,
      isNew: true,
    };

    set({
      tabs: [...tabs, newTab],
      activeTabId: id,
      untitledCounter: newCounter,
    });

    return id;
  },

  openQuery: (
    queryId: string,
    name: string,
    content: string,
    linkState?: {
      linkedQaCustomerKey: string | null;
      linkedQaName: string | null;
    },
  ) => {
    const { tabs } = get();

    // Check if query is already open - switch to existing tab
    const existingTab = tabs.find((t) => t.queryId === queryId);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return existingTab.id;
    }

    // Create new tab for the query
    const id = `query-${queryId}`;
    const newTab: Tab = {
      id,
      queryId,
      name,
      content,
      originalContent: content,
      isDirty: false,
      isNew: false,
      linkedQaCustomerKey: linkState?.linkedQaCustomerKey ?? null,
      linkedQaName: linkState?.linkedQaName ?? null,
    };

    set({
      tabs: [...tabs, newTab],
      activeTabId: id,
    });

    return id;
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) {
      return;
    }

    const newTabs = tabs.filter((t) => t.id !== tabId);

    // Determine new active tab
    let newActiveTabId = activeTabId;
    if (activeTabId === tabId) {
      if (newTabs.length === 0) {
        newActiveTabId = null;
      } else if (tabIndex >= newTabs.length) {
        // Closed tab was last, select previous
        newActiveTabId = newTabs[newTabs.length - 1]?.id ?? null;
      } else {
        // Select tab at same position
        newActiveTabId = newTabs[tabIndex]?.id ?? null;
      }
    }

    set({
      tabs: newTabs,
      activeTabId: newActiveTabId,
    });
  },

  setActiveTab: (tabId: string) => {
    const { tabs } = get();
    if (tabs.some((t) => t.id === tabId)) {
      set({ activeTabId: tabId });
    }
  },

  updateTabContent: (tabId: string, content: string) => {
    const { tabs } = get();
    set({
      tabs: tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              content,
              isDirty: t.isNew ? true : t.originalContent !== content,
            }
          : t,
      ),
    });
  },

  markTabSaved: (tabId: string, queryId: string, name: string) => {
    const { tabs } = get();
    set({
      tabs: tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              queryId,
              name,
              originalContent: t.content,
              isDirty: false,
              isNew: false,
              id: `query-${queryId}`,
            }
          : t,
      ),
      activeTabId: `query-${queryId}`,
    });
  },

  renameTab: (tabId: string, name: string) => {
    const { tabs } = get();
    set({
      tabs: tabs.map((t) =>
        t.id === tabId ? { ...t, name, isDirty: true } : t,
      ),
    });
  },

  updateTabLinkState: (
    tabId: string,
    linkState: {
      linkedQaCustomerKey: string | null;
      linkedQaName: string | null;
    },
  ) => {
    const { tabs } = get();
    set({
      tabs: tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              linkedQaCustomerKey: linkState.linkedQaCustomerKey,
              linkedQaName: linkState.linkedQaName,
            }
          : t,
      ),
    });
  },

  findTabByQueryId: (queryId: string) => {
    return get().tabs.find((t) => t.queryId === queryId);
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId);
  },

  hasDirtyTabs: () => {
    return get().tabs.some((t) => t.isDirty);
  },

  getDirtyTabs: () => {
    return get().tabs.filter((t) => t.isDirty);
  },

  reset: () => {
    set({ ...initialState, tabs: [], activeTabId: null, untitledCounter: 0 });
  },
}));
